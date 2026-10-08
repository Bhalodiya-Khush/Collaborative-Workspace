const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const User = require('../models/User');
const Workspace = require('../models/Workspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const ActivityLog = require('../models/ActivityLog');
const { resolveProjectAccess } = require('../middleware/projectAccess');
const {
  handlePostUsersRegister,
  handlePostWorkspaces,
  handlePostProjects,
  handlePostWorkspacesWorkspaceIdMembers,
  handlePatchProjectsProjectIdManager,
  handlePostProjectsProjectIdMembers,
} = require('../controllers/apiController');

const originalMethods = {
  userFindOne: User.findOne,
  userFind: User.find,
  userCreate: User.create,
  userUpdateMany: User.updateMany,
  userFindByIdAndUpdate: User.findByIdAndUpdate,
  userFindById: User.findById,
  workspaceCreate: Workspace.create,
  workspaceFindByIdAndUpdate: Workspace.findByIdAndUpdate,
  workspaceFindOne: Workspace.findOne,
  workspaceExists: Workspace.exists,
  workspaceMemberFindOneAndUpdate: WorkspaceMember.findOneAndUpdate,
  workspaceMemberFindOne: WorkspaceMember.findOne,
  projectFindById: Project.findById,
  projectCreate: Project.create,
  projectFindByIdAndUpdate: Project.findByIdAndUpdate,
  projectMemberFindOneAndUpdate: ProjectMember.findOneAndUpdate,
  activityCreate: ActivityLog.create,
};

const response = () => ({
  statusCode: 200,
  body: null,
  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
  cookie() {},
});

test.after(() => {
  User.findOne = originalMethods.userFindOne;
  User.find = originalMethods.userFind;
  User.create = originalMethods.userCreate;
  User.updateMany = originalMethods.userUpdateMany;
  User.findByIdAndUpdate = originalMethods.userFindByIdAndUpdate;
  User.findById = originalMethods.userFindById;
  Workspace.create = originalMethods.workspaceCreate;
  Workspace.findByIdAndUpdate = originalMethods.workspaceFindByIdAndUpdate;
  Workspace.findOne = originalMethods.workspaceFindOne;
  Workspace.exists = originalMethods.workspaceExists;
  WorkspaceMember.findOneAndUpdate = originalMethods.workspaceMemberFindOneAndUpdate;
  WorkspaceMember.findOne = originalMethods.workspaceMemberFindOne;
  Project.findById = originalMethods.projectFindById;
  Project.create = originalMethods.projectCreate;
  Project.findByIdAndUpdate = originalMethods.projectFindByIdAndUpdate;
  ProjectMember.findOneAndUpdate = originalMethods.projectMemberFindOneAndUpdate;
  ActivityLog.create = originalMethods.activityCreate;
});

test('registration, workspace, and project assignments keep roles in membership records', async () => {
  const userId = new mongoose.Types.ObjectId();
  const workspaceId = new mongoose.Types.ObjectId();
  const secondWorkspaceId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const secondProjectId = new mongoose.Types.ObjectId();
  const ownerId = new mongoose.Types.ObjectId();
  const registeredUser = {
    _id: userId,
    fullName: 'Contextual User',
    email: 'context@example.com',
    select: async () => registeredUser,
    toObject() {
      return { _id: this._id, fullName: this.fullName, email: this.email };
    },
  };
  const registrationData = [];
  const workspaceRoles = [];
  const projectRoles = [];
  let registrationPhase = true;

  User.findOne = async () => (registrationPhase ? null : registeredUser);
  User.find = () => ({
    select: async () => [{ _id: ownerId }],
  });
  User.create = async (data) => {
    registrationData.push(data);
    return registeredUser;
  };
  User.updateMany = async () => ({ acknowledged: true });
  User.findByIdAndUpdate = async () => ({ acknowledged: true });
  User.findById = async () => ({ ...registeredUser, isActive: true });
  Workspace.create = async (data) => ({ ...data, _id: workspaceId });
  Workspace.findByIdAndUpdate = async () => ({ acknowledged: true });
  Workspace.findOne = async () => ({ _id: workspaceId });
  Workspace.exists = async () => true;
  WorkspaceMember.findOneAndUpdate = async (filter, update) => {
    workspaceRoles.push({ filter, role: update.role });
    return update;
  };
  Project.findByIdAndUpdate = async () => ({ acknowledged: true });
  ProjectMember.findOneAndUpdate = (filter, update) => {
    projectRoles.push({ filter, role: update.role });
    return {
    populate: async () => {
        return { role: update.role, user: registeredUser };
      },
    };
  };
  ActivityLog.create = async () => ({});

  const registrationResponse = response();
  await handlePostUsersRegister(
    { body: { fullName: 'Contextual User', email: 'CONTEXT@example.com', password: 'password123' } },
    registrationResponse
  );
  assert.equal(registrationResponse.statusCode, 201);
  assert.equal(Object.hasOwn(registrationData[0], 'role'), false);
  registrationPhase = false;

  const workspaceResponse = response();
  await handlePostWorkspaces(
    { body: { name: 'Owned Workspace' }, user: { _id: ownerId, fullName: 'Owner' } },
    workspaceResponse
  );
  assert.equal(workspaceResponse.statusCode, 201);
  assert.ok(workspaceRoles.some(({ filter, role }) => (
    filter.user.toString() === ownerId.toString() && role === 'admin'
  )));

  const addWorkspaceMemberResponse = response();
  await handlePostWorkspacesWorkspaceIdMembers(
    {
      user: { _id: ownerId },
      workspace: { _id: workspaceId, settings: { defaultRole: 'developer' } },
      body: { userId: userId.toString(), role: 'project_manager' },
    },
    addWorkspaceMemberResponse
  );
  assert.equal(addWorkspaceMemberResponse.statusCode, 201);
  assert.ok(workspaceRoles.some(({ filter, role }) => (
    filter.user.toString() === userId.toString() && role === 'project_manager'
  )));

  const addSecondWorkspaceMemberResponse = response();
  await handlePostWorkspacesWorkspaceIdMembers(
    {
      user: { _id: ownerId },
      workspace: { _id: secondWorkspaceId, settings: { defaultRole: 'developer' } },
      body: { userId: userId.toString(), role: 'developer' },
    },
    addSecondWorkspaceMemberResponse
  );
  assert.equal(addSecondWorkspaceMemberResponse.statusCode, 201);

  User.findOne = () => ({
    select: async () => registeredUser,
    then(resolve, reject) {
      return Promise.resolve(registeredUser).then(resolve, reject);
    },
  });
  const projectManagerResponse = response();
  await handlePatchProjectsProjectIdManager(
    {
      user: { _id: ownerId },
      project: {
        _id: projectId,
        workspace: workspaceId,
        projectManager: ownerId,
        async save() {},
      },
      body: { projectManagerId: userId.toString() },
    },
    projectManagerResponse
  );
  assert.equal(projectManagerResponse.statusCode, 200);

  const addProjectMemberResponse = response();
  await handlePostProjectsProjectIdMembers(
    {
      user: { _id: ownerId },
      project: { _id: secondProjectId, workspace: secondWorkspaceId, projectManager: ownerId },
      params: { projectId: secondProjectId.toString() },
      body: { userId: userId.toString(), role: 'developer', accessLevel: 'write' },
    },
    addProjectMemberResponse
  );
  assert.equal(addProjectMemberResponse.statusCode, 201);
  assert.ok(projectRoles.some(({ filter, role }) => (
    filter.project.toString() === projectId.toString()
      && filter.user.toString() === userId.toString()
      && role === 'project_manager'
  )));
  assert.ok(projectRoles.some(({ filter, role }) => (
    filter.project.toString() === secondProjectId.toString()
      && filter.user.toString() === userId.toString()
      && role === 'developer'
  )));
  assert.equal(Object.hasOwn(registeredUser, 'role'), false);
});

test('an authorized workspace admin can create and assign a project with contextual roles', async () => {
  const adminId = new mongoose.Types.ObjectId();
  const managerId = new mongoose.Types.ObjectId();
  const developerId = new mongoose.Types.ObjectId();
  const workspaceId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const memberships = [];
  const projectData = [];

  User.find = () => ({
    select: async () => [{ _id: managerId }, { _id: developerId }],
  });
  User.updateMany = async () => ({ acknowledged: true });
  Workspace.findOne = async () => ({ _id: workspaceId });
  Workspace.findByIdAndUpdate = async () => ({ acknowledged: true });
  Project.create = async (data) => {
    projectData.push(data);
    return { ...data, _id: projectId };
  };
  ProjectMember.findOneAndUpdate = async (filter, update) => {
    memberships.push({ filter, role: update.role, accessLevel: update.accessLevel });
    return update;
  };
  ActivityLog.create = async () => ({});

  const res = response();
  await handlePostProjects({
    user: { _id: adminId },
    workspace: { _id: workspaceId },
    body: {
      name: 'Regression Project',
      workspace: workspaceId.toString(),
      projectManager: managerId.toString(),
      developers: [developerId.toString()],
    },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.project._id, projectId);
  assert.equal(projectData[0].name, 'Regression Project');
  assert.ok(memberships.some(({ filter, role, accessLevel }) => (
    filter.user.toString() === managerId.toString()
      && role === 'project_manager'
      && accessLevel === 'admin'
  )));
  assert.ok(memberships.some(({ filter, role, accessLevel }) => (
    filter.user.toString() === developerId.toString()
      && role === 'developer'
      && accessLevel === 'write'
  )));
});

test('one user can be project manager and developer in separate project memberships', async () => {
  const userId = new mongoose.Types.ObjectId();
  const projectManagerProject = new mongoose.Types.ObjectId();
  const developerProject = new mongoose.Types.ObjectId();
  const projectManagerWorkspace = new mongoose.Types.ObjectId();
  const developerWorkspace = new mongoose.Types.ObjectId();
  const otherUserId = new mongoose.Types.ObjectId();

  Project.findById = async (id) => {
    const isManagerProject = id.toString() === projectManagerProject.toString();
    return {
      _id: id,
      workspace: isManagerProject ? projectManagerWorkspace : developerWorkspace,
      projectManager: otherUserId,
      developers: [],
    };
  };
  Workspace.findOne = () => ({
    select: async () => ({ _id: projectManagerWorkspace, owner: otherUserId }),
  });
  WorkspaceMember.findOne = () => ({
    select: async () => ({ role: 'developer', isActive: true }),
  });
  ProjectMember.findOne = async ({ project }) => project.toString() === projectManagerProject.toString()
    ? { isActive: true, role: 'project_manager', accessLevel: 'admin' }
    : { isActive: true, role: 'developer', accessLevel: 'write' };

  const managerAccess = await resolveProjectAccess({ _id: userId }, projectManagerProject);
  const developerAccess = await resolveProjectAccess({ _id: userId }, developerProject);

  assert.deepEqual([...managerAccess.permissions].sort(), ['manage', 'read', 'review', 'write']);
  assert.deepEqual([...developerAccess.permissions].sort(), ['read', 'write']);
  assert.equal(managerAccess.membership.role, 'project_manager');
  assert.equal(developerAccess.membership.role, 'developer');
});

test('user schema does not define a global role; membership schemas define contextual roles', () => {
  assert.equal(User.schema.path('role'), undefined);
  assert.deepEqual(WorkspaceMember.schema.path('role').enumValues, [
    'admin',
    'project_manager',
    'developer',
    'viewer',
  ]);
  assert.deepEqual(ProjectMember.schema.path('role').enumValues, [
    'project_manager',
    'developer',
    'reviewer',
    'guest',
  ]);
});
