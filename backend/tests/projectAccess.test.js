const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const Workspace = require('../models/Workspace');
const { resolveProjectAccess } = require('../middleware/projectAccess');

const projectId = new mongoose.Types.ObjectId();
const workspaceId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const projectManagerId = new mongoose.Types.ObjectId();

const originalMethods = {
  findById: Project.findById,
  workspaceFindOne: Workspace.findOne,
  memberFindOne: ProjectMember.findOne,
};

const configureAccess = ({
  workspaceActive = true,
  membership = null,
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
};

test.after(() => {
  Project.findById = originalMethods.findById;
  Workspace.findOne = originalMethods.workspaceFindOne;
  ProjectMember.findOne = originalMethods.memberFindOne;
});

test('assigned project managers receive project management permissions', async () => {
  configureAccess();

  const access = await resolveProjectAccess(
    { _id: projectManagerId, role: 'project_manager' },
    projectId
  );

  assert.deepEqual([...access.permissions].sort(), ['manage', 'read', 'review', 'write']);
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
