const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const Workspace = require('../models/Workspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const Task = require('../models/Task');
const ActivityLog = require('../models/ActivityLog');
const requireWorkspaceAccess = require('../middleware/workspaceAccess');
const { requireWorkspaceRole } = require('../middleware/workspaceAccess');
const apiRouter = require('../routes/api');

const originalWorkspaceFindOne = Workspace.findOne;
const originalMembershipFindOne = WorkspaceMember.findOne;
const originalUserFindById = User.findById;
const originalJwtVerify = jwt.verify;
const originalProjectFindById = Project.findById;
const originalProjectMemberFindOne = ProjectMember.findOne;
const originalProjectFindByIdAndUpdate = Project.findByIdAndUpdate;
const originalTaskFindById = Task.findById;
const originalTaskAggregate = Task.aggregate;
const originalActivityCreate = ActivityLog.create;

test.after(() => {
  Workspace.findOne = originalWorkspaceFindOne;
  WorkspaceMember.findOne = originalMembershipFindOne;
  User.findById = originalUserFindById;
  jwt.verify = originalJwtVerify;
  Project.findById = originalProjectFindById;
  ProjectMember.findOne = originalProjectMemberFindOne;
  Project.findByIdAndUpdate = originalProjectFindByIdAndUpdate;
  Task.findById = originalTaskFindById;
  Task.aggregate = originalTaskAggregate;
  ActivityLog.create = originalActivityCreate;
});

const makeResponse = () => ({
  statusCode: 200,
  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const configureWorkspace = ({ role = 'developer', active = true, owner = 'owner-id' } = {}) => {
  Workspace.findOne = async () => ({
    _id: 'workspace-id',
    owner,
    members: ['user-id'],
    status: 'active',
  });
  WorkspaceMember.findOne = () => ({
    select: async () => active ? { role } : null,
  });
};

test('workspace role is loaded from that workspace membership, not the global user role', async () => {
  configureWorkspace({ role: 'project_manager' });
  const req = {
    params: { workspaceId: 'workspace-id' },
    user: { _id: 'user-id', role: 'developer' },
  };
  const res = makeResponse();
  let passedAccess = false;
  await requireWorkspaceAccess(req, res, () => { passedAccess = true; });
  assert.equal(passedAccess, true);
  assert.equal(req.workspaceRole, 'project_manager');

  let passedRole = false;
  await requireWorkspaceRole('admin', 'project_manager')(req, res, () => { passedRole = true; });
  assert.equal(passedRole, true);
});

test('one account receives a different contextual role in each selected workspace', async () => {
  Workspace.findOne = async ({ _id }) => ({
    _id,
    owner: 'workspace-owner',
    members: ['user-id'],
    status: 'active',
  });
  WorkspaceMember.findOne = (filter) => ({
    select: async () => ({
      role: filter.workspace === 'workspace-one' ? 'admin' : 'developer',
    }),
  });

  const user = { _id: 'user-id', role: 'project_manager' };
  const selectedRoles = [];
  for (const workspaceId of ['workspace-one', 'workspace-two']) {
    const req = { params: { workspaceId }, user };
    const res = makeResponse();
    await requireWorkspaceAccess(req, res, () => {});
    selectedRoles.push(req.workspaceRole);
  }

  assert.deepEqual(selectedRoles, ['admin', 'developer']);
});

test('different members of one workspace receive independent roles', async () => {
  Workspace.findOne = async () => ({
    _id: 'workspace-id',
    owner: 'owner-id',
    members: ['admin-user', 'developer-user'],
    status: 'active',
  });
  WorkspaceMember.findOne = (filter) => ({
    select: async () => ({
      role: filter.user === 'admin-user' ? 'admin' : 'developer',
    }),
  });

  const results = [];
  for (const userId of ['admin-user', 'developer-user']) {
    const req = { params: { workspaceId: 'workspace-id' }, user: { _id: userId } };
    const res = makeResponse();
    let passedAdmin = false;
    await requireWorkspaceAccess(req, res, () => {});
    await requireWorkspaceRole('admin')(req, res, () => { passedAdmin = true; });
    results.push({ role: req.workspaceRole, passedAdmin, status: res.statusCode });
  }

  assert.deepEqual(results, [
    { role: 'admin', passedAdmin: true, status: 200 },
    { role: 'developer', passedAdmin: false, status: 403 },
  ]);
});

test('global admin role cannot pass workspace admin authorization when workspace role is developer', async () => {
  configureWorkspace({ role: 'developer' });
  const req = {
    params: { workspaceId: 'workspace-id' },
    user: { _id: 'user-id', role: 'admin' },
  };
  const res = makeResponse();
  await requireWorkspaceAccess(req, res, () => {});
  await requireWorkspaceRole('admin')(req, res, () => {});

  assert.equal(res.statusCode, 403);
});

test('inactive workspace membership cannot access workspace role functionality', async () => {
  configureWorkspace({ active: false });
  const req = {
    params: { workspaceId: 'workspace-id' },
    user: { _id: 'user-id', role: 'admin' },
  };
  const res = makeResponse();
  let passed = false;
  await requireWorkspaceAccess(req, res, () => { passed = true; });

  assert.equal(passed, false);
  assert.equal(res.statusCode, 404);
});

test('removing a user from a workspace revokes workspace access even if the member list is stale', async () => {
  let membershipActive = true;
  Workspace.findOne = async () => ({
    _id: 'workspace-id',
    owner: 'owner-id',
    members: ['user-id'],
    status: 'active',
  });
  WorkspaceMember.findOne = () => ({
    select: async () => membershipActive ? { role: 'admin' } : null,
  });

  const req = { params: { workspaceId: 'workspace-id' }, user: { _id: 'user-id' } };
  const res = makeResponse();
  let passed = false;
  await requireWorkspaceAccess(req, res, () => { passed = true; });
  assert.equal(passed, true);

  membershipActive = false;
  const afterRemovalResponse = makeResponse();
  passed = false;
  await requireWorkspaceAccess(req, afterRemovalResponse, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(afterRemovalResponse.statusCode, 404);
});

test('workspace owner has the contextual admin role regardless of global role', async () => {
  configureWorkspace({ owner: 'user-id' });
  const req = {
    params: { workspaceId: 'workspace-id' },
    user: { _id: 'user-id', role: 'developer' },
  };
  const res = makeResponse();
  await requireWorkspaceAccess(req, res, () => {});

  assert.equal(req.workspaceRole, 'admin');
});

test('manual API request cannot use a global admin role to call another workspace admin endpoint', async () => {
  const workspaceId = 'manual-api-workspace';
  const userId = 'manual-api-user';
  Workspace.findOne = async () => ({
    _id: workspaceId,
    owner: 'another-owner',
    members: [userId],
    status: 'active',
  });
  WorkspaceMember.findOne = () => ({
    select: async () => ({ role: 'developer' }),
  });
  User.findById = () => ({
    select: async () => ({
      _id: userId,
      role: 'admin',
      isActive: true,
      tokenVersion: 0,
      set() {},
    }),
  });
  jwt.verify = () => ({ userId, tokenVersion: 0 });

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceId}/members`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: 'target-user' }),
    });

    assert.equal(response.status, 403);
    assert.match((await response.json()).message, /Required workspace role: admin/);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('Admin API access is limited to the Workspace where the user is an Admin', async () => {
  const workspaceOne = '64b000000000000000000001';
  const workspaceTwo = '64b000000000000000000002';
  const userId = '64b000000000000000000003';
  Workspace.findOne = async ({ _id }) => ({
    _id,
    owner: '64b000000000000000000004',
    members: [userId],
    status: 'active',
  });
  WorkspaceMember.findOne = (filter) => ({
    select: async () => ({
      role: filter.workspace === workspaceOne ? 'admin' : 'developer',
    }),
  });
  User.findById = () => ({
    select: async () => ({
      _id: userId,
      isActive: true,
      tokenVersion: 0,
      set() {},
    }),
  });
  jwt.verify = () => ({ userId, tokenVersion: 0 });

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  try {
    const { port } = server.address();
    const request = (workspaceId) => fetch(
      `http://127.0.0.1:${port}/api/workspaces/${workspaceId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    );

    const [adminResponse, developerResponse] = await Promise.all([
      request(workspaceOne),
      request(workspaceTwo),
    ]);
    assert.equal(adminResponse.status, 400);
    assert.equal(developerResponse.status, 403);
    assert.match((await developerResponse.json()).message, /Required workspace role: admin/);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('Project Manager API access is limited to the Project where the user is assigned', async () => {
  const userId = '64b100000000000000000001';
  const ownerId = '64b100000000000000000002';
  const workspaceId = '64b100000000000000000003';
  const projectOne = '64b100000000000000000004';
  const projectTwo = '64b100000000000000000005';
  const taskId = '64b100000000000000000006';
  const projects = new Map([
    [projectOne, { _id: projectOne, workspace: workspaceId, projectManager: ownerId, developers: [] }],
    [projectTwo, { _id: projectTwo, workspace: workspaceId, projectManager: ownerId, developers: [] }],
  ]);
  Project.findById = async (id) => projects.get(id.toString()) || null;
  Workspace.findOne = () => ({
    select: async () => ({ _id: workspaceId, owner: ownerId }),
  });
  WorkspaceMember.findOne = () => ({
    select: async () => ({ role: 'developer' }),
  });
  ProjectMember.findOne = async ({ project }) => (
    project.toString() === projectOne
      ? { isActive: true, role: 'project_manager', accessLevel: 'admin' }
      : { isActive: true, role: 'developer', accessLevel: 'write' }
  );
  const task = {
    _id: taskId,
    project: projectTwo,
    workspace: workspaceId,
    assignee: userId,
    status: 'todo',
    async save() {},
  };
  Task.findById = () => ({
    select: async () => ({ project: projectTwo }),
    then(resolve, reject) {
      return Promise.resolve(task).then(resolve, reject);
    },
  });
  Task.aggregate = async () => [];
  Project.findByIdAndUpdate = async () => ({});
  ActivityLog.create = async () => ({});
  User.findById = () => ({
    select: async () => ({
      _id: userId,
      isActive: true,
      tokenVersion: 0,
      set() {},
    }),
  });
  jwt.verify = () => ({ userId, tokenVersion: 0 });

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  try {
    const { port } = server.address();
    const request = (project, workspace) => fetch(`http://127.0.0.1:${port}/api/tasks`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ project, workspace }),
    });
    const [managerResponse, developerManagerResponse, developerWriteResponse] = await Promise.all([
      request(projectOne, workspaceId),
      request(projectTwo, workspaceId),
      fetch(`http://127.0.0.1:${port}/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'in_review' }),
      }),
    ]);

    assert.equal(managerResponse.status, 400);
    assert.match((await managerResponse.json()).message, /Task title, project and workspace are required/);
    assert.equal(developerManagerResponse.status, 403);
    assert.match((await developerManagerResponse.json()).message, /manage access to this project/);
    assert.equal(developerWriteResponse.status, 200);
    assert.equal(task.status, 'in_review');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
