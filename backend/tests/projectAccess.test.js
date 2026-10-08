const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const Workspace = require('../models/Workspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const {
  resolveProjectAccess,
  getAccessibleProjectIds,
  requireProjectRoles,
} = require('../middleware/projectAccess');

const projectId = new mongoose.Types.ObjectId();
const workspaceId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const projectManagerId = new mongoose.Types.ObjectId();

const originalMethods = {
  findById: Project.findById,
  workspaceFindOne: Workspace.findOne,
  workspaceFind: Workspace.find,
  workspaceMemberFindOne: WorkspaceMember.findOne,
  workspaceMemberFind: WorkspaceMember.find,
  memberFindOne: ProjectMember.findOne,
  memberFind: ProjectMember.find,
  projectFind: Project.find,
};

const configureAccess = ({
  workspaceActive = true,
  membership = null,
  workspaceMembership = { role: 'developer' },
  workspaceMembershipActive = true,
  legacyDeveloper = false,
  workspaceOwner = projectManagerId,
} = {}) => {
  Project.findById = async () => ({
    _id: projectId,
    workspace: workspaceId,
    projectManager: projectManagerId,
    developers: legacyDeveloper ? [userId] : [],
  });
  Workspace.findOne = () => ({
    select: async () => (workspaceActive ? { _id: workspaceId, owner: workspaceOwner } : null),
  });
  ProjectMember.findOne = async () => membership;
  WorkspaceMember.findOne = () => ({
    select: async () => workspaceMembershipActive ? workspaceMembership : null,
  });
};

test.after(() => {
  Project.findById = originalMethods.findById;
  Workspace.findOne = originalMethods.workspaceFindOne;
  Workspace.find = originalMethods.workspaceFind;
  WorkspaceMember.findOne = originalMethods.workspaceMemberFindOne;
  WorkspaceMember.find = originalMethods.workspaceMemberFind;
  ProjectMember.findOne = originalMethods.memberFindOne;
  ProjectMember.find = originalMethods.memberFind;
  Project.find = originalMethods.projectFind;
});

test('assigned project managers receive project management permissions', async () => {
  configureAccess();

  const access = await resolveProjectAccess(
    { _id: projectManagerId, role: 'project_manager' },
    projectId
  );

  assert.deepEqual([...access.permissions].sort(), ['manage', 'read', 'review', 'write']);
});

test('project membership determines role even when an account has a conflicting legacy role', async () => {
  configureAccess({
    membership: { isActive: true, role: 'developer', accessLevel: 'write' },
  });

  const access = await resolveProjectAccess(
    { _id: userId, role: 'project_manager' },
    projectId
  );

  assert.deepEqual([...access.permissions].sort(), ['read', 'write']);
});

test('workspace owner authorization is contextual and independent of account role', async () => {
  configureAccess({ workspaceOwner: userId });
  const access = await resolveProjectAccess({ _id: userId }, projectId);

  assert.deepEqual([...access.permissions].sort(), ['manage', 'read', 'review', 'write']);
});

test('workspace project managers receive manager permissions for projects in that workspace', async () => {
  configureAccess({
    workspaceMembership: { role: 'project_manager' },
  });
  const access = await resolveProjectAccess({ _id: userId }, projectId);

  assert.deepEqual([...access.permissions].sort(), ['manage', 'read', 'review', 'write']);
  assert.equal(access.role, 'project_manager');
});

test('project roles stay isolated when one user is manager in one project and developer in another', async () => {
  const firstUserId = new mongoose.Types.ObjectId();
  const firstProjectId = new mongoose.Types.ObjectId();
  const secondProjectId = new mongoose.Types.ObjectId();
  const sharedWorkspaceId = new mongoose.Types.ObjectId();
  const otherUserId = new mongoose.Types.ObjectId();

  const projects = new Map([
    [firstProjectId.toString(), {
      _id: firstProjectId,
      workspace: sharedWorkspaceId,
      projectManager: otherUserId,
      developers: [],
    }],
    [secondProjectId.toString(), {
      _id: secondProjectId,
      workspace: sharedWorkspaceId,
      projectManager: otherUserId,
      developers: [],
    }],
  ]);
  Project.findById = async (id) => projects.get(id.toString());
  Workspace.findOne = () => ({
    select: async () => ({ _id: sharedWorkspaceId, owner: otherUserId }),
  });
  WorkspaceMember.findOne = () => ({
    select: async () => ({ role: 'developer' }),
  });
  ProjectMember.findOne = async ({ project }) => project.toString() === firstProjectId.toString()
    ? { isActive: true, role: 'project_manager', accessLevel: 'admin' }
    : { isActive: true, role: 'developer', accessLevel: 'write' };

  const user = { _id: firstUserId };
  const managerAccess = await resolveProjectAccess(user, firstProjectId);
  const developerAccess = await resolveProjectAccess(user, secondProjectId);

  assert.equal(managerAccess.role, 'project_manager');
  assert.deepEqual([...managerAccess.permissions].sort(), ['manage', 'read', 'review', 'write']);
  assert.equal(developerAccess.role, 'developer');
  assert.deepEqual([...developerAccess.permissions].sort(), ['read', 'write']);

  const req = { user, params: { projectId: secondProjectId.toString() } };
  const res = {
    statusCode: 200,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let passed = false;
  await requireProjectRoles('project_manager')(req, res, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(res.statusCode, 403);
});

test('explicit project membership overrides workspace project-manager role for that project', async () => {
  configureAccess({
    workspaceMembership: { role: 'project_manager' },
    membership: { isActive: true, role: 'developer', accessLevel: 'write' },
  });

  const access = await resolveProjectAccess({ _id: userId }, projectId);

  assert.equal(access.role, 'developer');
  assert.deepEqual([...access.permissions].sort(), ['read', 'write']);
});

test('three users keep independent roles across two workspaces and their projects', async () => {
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();
  const userC = new mongoose.Types.ObjectId();
  const workspaceOne = new mongoose.Types.ObjectId();
  const workspaceTwo = new mongoose.Types.ObjectId();
  const projectOne = new mongoose.Types.ObjectId();
  const projectTwo = new mongoose.Types.ObjectId();
  const owner = new mongoose.Types.ObjectId();

  const workspaces = new Map([
    [workspaceOne.toString(), { _id: workspaceOne, owner }],
    [workspaceTwo.toString(), { _id: workspaceTwo, owner }],
  ]);
  const projects = new Map([
    [projectOne.toString(), { _id: projectOne, workspace: workspaceOne, projectManager: owner, developers: [] }],
    [projectTwo.toString(), { _id: projectTwo, workspace: workspaceTwo, projectManager: owner, developers: [] }],
  ]);
  const workspaceMemberships = new Map([
    [`${workspaceOne}:${userA}`, 'admin'],
    [`${workspaceTwo}:${userA}`, 'developer'],
    [`${workspaceOne}:${userB}`, 'project_manager'],
    [`${workspaceTwo}:${userB}`, 'developer'],
    [`${workspaceOne}:${userC}`, 'developer'],
  ]);
  const projectMemberships = new Map([
    [`${projectTwo}:${userA}`, { isActive: true, role: 'developer', accessLevel: 'write' }],
    [`${projectOne}:${userB}`, { isActive: true, role: 'project_manager', accessLevel: 'admin' }],
    [`${projectTwo}:${userB}`, { isActive: true, role: 'developer', accessLevel: 'write' }],
    [`${projectOne}:${userC}`, { isActive: true, role: 'developer', accessLevel: 'write' }],
  ]);

  Project.findById = async (id) => projects.get(id.toString()) || null;
  Workspace.findOne = (filter) => ({
    select: async () => workspaces.get(filter._id.toString()) || null,
  });
  WorkspaceMember.findOne = (filter) => ({
    select: async () => {
      const role = workspaceMemberships.get(`${filter.workspace}:${filter.user}`);
      return role ? { role } : null;
    },
  });
  ProjectMember.findOne = async (filter) => (
    projectMemberships.get(`${filter.project}:${filter.user}`) || null
  );

  const contexts = [
    [userA, projectOne, 'admin'],
    [userA, projectTwo, 'developer'],
    [userB, projectOne, 'project_manager'],
    [userB, projectTwo, 'developer'],
    [userC, projectOne, 'developer'],
    [userC, projectTwo, null],
  ];
  const results = await Promise.all(contexts.map(async ([user, project, expectedRole]) => {
    const access = await resolveProjectAccess({ _id: user }, project);
    assert.equal(access?.role || null, expectedRole);
    return access?.permissions || new Set();
  }));

  assert.deepEqual([...results[0]].sort(), ['manage', 'read', 'review', 'write']);
  assert.deepEqual([...results[1]].sort(), ['read', 'write']);
  assert.deepEqual([...results[2]].sort(), ['manage', 'read', 'review', 'write']);
  assert.deepEqual([...results[3]].sort(), ['read', 'write']);
  assert.deepEqual([...results[4]].sort(), ['read', 'write']);
  assert.deepEqual([...results[5]], []);
});

test('dashboard project access lists only Workspaces and Projects each member can access', async () => {
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();
  const userC = new mongoose.Types.ObjectId();
  const owner = new mongoose.Types.ObjectId();
  const workspaceOne = new mongoose.Types.ObjectId();
  const workspaceTwo = new mongoose.Types.ObjectId();
  const projectOne = new mongoose.Types.ObjectId();
  const projectTwo = new mongoose.Types.ObjectId();
  const workspaces = [
    { _id: workspaceOne, owner },
    { _id: workspaceTwo, owner },
  ];
  const projects = [
    { _id: projectOne, workspace: workspaceOne, projectManager: owner, developers: [] },
    { _id: projectTwo, workspace: workspaceTwo, projectManager: owner, developers: [] },
  ];
  const workspaceMemberships = [
    { workspace: workspaceOne, user: userA, role: 'admin', isActive: true },
    { workspace: workspaceTwo, user: userA, role: 'developer', isActive: true },
    { workspace: workspaceOne, user: userB, role: 'project_manager', isActive: true },
    { workspace: workspaceTwo, user: userB, role: 'developer', isActive: true },
    { workspace: workspaceOne, user: userC, role: 'developer', isActive: true },
  ];
  const projectMemberships = [
    { project: projectTwo, user: userA, role: 'developer', accessLevel: 'write', isActive: true },
    { project: projectOne, user: userB, role: 'project_manager', accessLevel: 'admin', isActive: true },
    { project: projectTwo, user: userB, role: 'developer', accessLevel: 'write', isActive: true },
    { project: projectOne, user: userC, role: 'developer', accessLevel: 'write', isActive: true },
  ];
  const idString = (id) => id?.toString();
  const matchesIds = (value, filter) => {
    if (!filter) return true;
    if (filter.$in && !filter.$in.some((id) => idString(id) === idString(value))) return false;
    if (filter.$nin?.some((id) => idString(id) === idString(value))) return false;
    return true;
  };
  const distinctQuery = (records, field) => [...new Map(
    records.map((record) => [idString(record[field]), record[field]])
  ).values()];

  Workspace.find = (filter) => ({
    distinct: async (field) => distinctQuery(workspaces.filter((workspace) => (
      (!filter.owner || idString(workspace.owner) === idString(filter.owner))
      && matchesIds(workspace._id, filter._id)
      && (!filter.status || workspace.status === filter.status || !workspace.status)
    )), field),
  });
  WorkspaceMember.find = (filter) => ({
    distinct: async (field) => distinctQuery(workspaceMemberships.filter((membership) => (
      (!filter.user || idString(membership.user) === idString(filter.user))
      && (!filter.role || membership.role === filter.role)
      && (filter.isActive === undefined || membership.isActive === filter.isActive)
      && matchesIds(membership.workspace, filter.workspace)
    )), field),
  });
  Project.find = (filter) => ({
    distinct: async (field) => distinctQuery(projects.filter((project) => (
      matchesIds(project.workspace, filter.workspace)
      && matchesIds(project._id, filter._id)
      && (!filter.projectManager || idString(project.projectManager) === idString(filter.projectManager))
      && (!filter.developers || project.developers.some((developer) => (
        idString(developer) === idString(filter.developers)
      )))
    )), field),
  });
  ProjectMember.find = (filter) => ({
    select: async () => projectMemberships.filter((membership) => (
      idString(membership.user) === idString(filter.user)
      && matchesIds(membership.project, filter.project)
    )),
  });

  const [accessibleForA, accessibleForB, accessibleForC] = await Promise.all([
    getAccessibleProjectIds({ _id: userA }),
    getAccessibleProjectIds({ _id: userB }),
    getAccessibleProjectIds({ _id: userC }),
  ]);
  const sortedIds = (ids) => ids.map(String).sort();
  assert.deepEqual(sortedIds(accessibleForA), sortedIds([projectOne, projectTwo]));
  assert.deepEqual(sortedIds(accessibleForB), sortedIds([projectOne, projectTwo]));
  assert.deepEqual(sortedIds(accessibleForC), sortedIds([projectOne]));
});

test('workspace administrators only manage projects in workspaces they own', async () => {
  configureAccess({ workspaceOwner: userId });
  const access = await resolveProjectAccess({ _id: userId, role: 'admin' }, projectId);
  assert.deepEqual([...access.permissions].sort(), ['manage', 'read', 'review', 'write']);

  configureAccess({ workspaceOwner: projectManagerId });
  const unrelatedAccess = await resolveProjectAccess({ _id: userId, role: 'admin' }, projectId);
  assert.equal(unrelatedAccess, null);
});

test('active developers receive write access, but not project management access', async () => {
  configureAccess({
    membership: { isActive: true, role: 'developer', accessLevel: 'write' },
  });

  const access = await resolveProjectAccess({ _id: userId, role: 'developer' }, projectId);

  assert.deepEqual([...access.permissions].sort(), ['read', 'write']);
});

test('reviewers receive review access without write access', async () => {
  configureAccess({
    membership: { isActive: true, role: 'reviewer', accessLevel: 'read' },
  });

  const access = await resolveProjectAccess({ _id: userId, role: 'developer' }, projectId);

  assert.deepEqual([...access.permissions].sort(), ['read', 'review']);
});

test('guests are read-only even when their stored access level says write', async () => {
  configureAccess({
    membership: { isActive: true, role: 'guest', accessLevel: 'write' },
  });

  const access = await resolveProjectAccess({ _id: userId, role: 'developer' }, projectId);

  assert.deepEqual([...access.permissions], ['read']);
});

test('viewers require an explicit read-only project membership', async () => {
  configureAccess({
    membership: { isActive: true, role: 'guest', accessLevel: 'read' },
  });

  const access = await resolveProjectAccess({ _id: userId, role: 'viewer' }, projectId);

  assert.deepEqual([...access.permissions], ['read']);
});

test('workspace membership alone does not grant viewers project access', async () => {
  configureAccess();

  const access = await resolveProjectAccess({ _id: userId, role: 'viewer' }, projectId);

  assert.equal(access, null);
});

test('an inactive project membership cannot use the legacy developer fallback', async () => {
  configureAccess({
    membership: { isActive: false, role: 'developer', accessLevel: 'write' },
    legacyDeveloper: true,
  });

  const access = await resolveProjectAccess({ _id: userId, role: 'developer' }, projectId);

  assert.equal(access, null);
});

test('inactive workspace membership cannot use project membership access', async () => {
  configureAccess({
    membership: { isActive: true, role: 'developer', accessLevel: 'write' },
    workspaceMembershipActive: false,
  });

  const access = await resolveProjectAccess({ _id: userId }, projectId);

  assert.equal(access, null);
});

test('legacy developers retain access only when no membership record exists', async () => {
  configureAccess({ legacyDeveloper: true });

  const access = await resolveProjectAccess({ _id: userId, role: 'developer' }, projectId);

  assert.deepEqual([...access.permissions].sort(), ['read', 'write']);
});

test('non-admins cannot access projects in archived or inaccessible workspaces', async () => {
  configureAccess({ workspaceActive: false });

  const access = await resolveProjectAccess({ _id: userId, role: 'developer' }, projectId);

  assert.equal(access, null);
});
