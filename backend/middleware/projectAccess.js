const fs = require('fs/promises');
const mongoose = require('mongoose');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const Workspace = require('../models/Workspace');
const WorkspaceMember = require('../models/WorkspaceMember');

const permissionNames = ['read', 'write', 'review', 'manage'];

const removeUploadedFiles = async (req) => {
  await Promise.all((req.files || []).map(async (file) => {
    try {
      await fs.unlink(file.path);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Rejected upload cleanup failed:', error.message);
      }
    }
  }));
};

const getProjectId = (req) => (
  req.params.projectId
  || req.params.id
  || req.body.project
  || req.query.projectId
);

const resolveProjectAccess = async (user, projectId) => {
  if (!user || !mongoose.isValidObjectId(projectId)) return null;

  const project = await Project.findById(projectId);
  if (!project) return null;

  const workspace = await Workspace.findOne({
    _id: project.workspace,
    status: 'active',
    $or: [{ owner: user._id }, { members: user._id }],
  }).select('_id owner');
  if (!workspace) return null;

  const workspaceMembership = await WorkspaceMember.findOne({
    workspace: workspace._id,
    user: user._id,
    isActive: true,
  }).select('role');
  const isWorkspaceOwner = workspace.owner?.toString() === user._id.toString();
  if (!isWorkspaceOwner && !workspaceMembership) return null;

  const isWorkspaceAdmin = isWorkspaceOwner || workspaceMembership?.role === 'admin';
  if (isWorkspaceAdmin) {
    return {
      project,
      membership: null,
      role: 'admin',
      permissions: new Set(permissionNames),
    };
  }

  const existingMembership = await ProjectMember.findOne({
    project: project._id,
    user: user._id,
  });
  if (existingMembership && !existingMembership.isActive) return null;

  let membership = existingMembership || null;
  if (!membership && workspaceMembership.role === 'project_manager') {
    membership = { role: 'project_manager', accessLevel: 'admin' };
  }
  if (!membership && project.projectManager.toString() === user._id.toString()) {
    membership = { role: 'project_manager', accessLevel: 'admin' };
  }
  if (!membership && project.developers.some((developer) => developer.toString() === user._id.toString())) {
    membership = {
      role: 'developer',
      accessLevel: 'write',
    };
  }
  if (!membership) return null;

  const permissions = new Set(['read']);
  if (membership.role === 'project_manager' && membership.accessLevel === 'admin') {
    permissions.add('write');
    permissions.add('review');
    permissions.add('manage');
  } else if (membership.role === 'developer' && ['write', 'admin'].includes(membership.accessLevel)) {
    permissions.add('write');
  } else if (membership.role === 'reviewer') {
    permissions.add('review');
  }

  return { project, membership, role: membership.role, permissions };
};

const getAccessibleProjectIds = async (user, permission = 'read') => {
  if (!permissionNames.includes(permission)) {
    throw new Error(`Unknown project permission: ${permission}`);
  }
  const [accessibleOwnedWorkspaceIds, memberWorkspaceIds] = await Promise.all([
    Workspace.find({ owner: user._id, status: 'active' }).distinct('_id'),
    WorkspaceMember.find({
      user: user._id,
      isActive: true,
    }).distinct('workspace'),
  ]);
  const activeMembershipWorkspaceIds = memberWorkspaceIds.length
    ? await Workspace.find({
      _id: { $in: memberWorkspaceIds },
      status: 'active',
    }).distinct('_id')
    : [];
  const workspaceIds = [...new Set([
    ...accessibleOwnedWorkspaceIds,
    ...activeMembershipWorkspaceIds,
  ].map((id) => id.toString()))];
  if (!workspaceIds.length) return [];

  const workspaceProjectIds = await Project.find({ workspace: { $in: workspaceIds } }).distinct('_id');
  if (!workspaceProjectIds.length) return [];

  const [ownedWorkspaceIds, adminMembershipWorkspaceIds, managerMembershipWorkspaceIds, managedProjectIds, memberships] = await Promise.all([
    Workspace.find({ _id: { $in: workspaceIds }, owner: user._id }).distinct('_id'),
    WorkspaceMember.find({
      workspace: { $in: workspaceIds },
      user: user._id,
      role: 'admin',
      isActive: true,
    }).distinct('workspace'),
    WorkspaceMember.find({
      workspace: { $in: workspaceIds },
      user: user._id,
      role: 'project_manager',
      isActive: true,
    }).distinct('workspace'),
    Project.find({
      projectManager: user._id,
      workspace: { $in: workspaceIds },
    }).distinct('_id'),
    ProjectMember.find({
      user: user._id,
      project: { $in: workspaceProjectIds },
    }).select('project role accessLevel isActive'),
  ]);

  const adminWorkspaceIds = new Set([
    ...ownedWorkspaceIds,
    ...adminMembershipWorkspaceIds,
  ].map((id) => id.toString()));
  const adminProjectIds = adminWorkspaceIds.size
    ? await Project.find({
      workspace: { $in: [...adminWorkspaceIds] },
    }).distinct('_id')
    : [];
  const membershipProjectIds = new Set(
    memberships.map((membership) => membership.project.toString())
  );
  const managerProjectCandidates = managerMembershipWorkspaceIds.length
    ? await Project.find({
      workspace: { $in: managerMembershipWorkspaceIds },
    }).distinct('_id')
    : [];
  const managerProjectIds = managerProjectCandidates.filter(
    (id) => !membershipProjectIds.has(id.toString())
  );
  const unscopedManagerProjectIds = managedProjectIds.filter(
    (id) => !membershipProjectIds.has(id.toString())
  );
  const accessibleIds = new Set([
    ...adminProjectIds,
    ...managerProjectIds,
    ...unscopedManagerProjectIds,
  ].map((id) => id.toString()));

  for (const membership of memberships) {
    if (!membership.isActive) continue;

    const hasPermission = permission === 'read'
      || (membership.role === 'project_manager' && membership.accessLevel === 'admin')
      || (permission === 'write' && membership.role === 'developer'
        && ['write', 'admin'].includes(membership.accessLevel))
      || (permission === 'review' && membership.role === 'reviewer');
    if (hasPermission) accessibleIds.add(membership.project.toString());
  }

  if (permission === 'read') {
    const legacyDeveloperProjectIds = await Project.find({
      workspace: { $in: workspaceIds },
      developers: user._id,
      _id: {
        $in: workspaceProjectIds,
        $nin: [...membershipProjectIds],
      },
    }).distinct('_id');
    legacyDeveloperProjectIds.forEach((id) => accessibleIds.add(id.toString()));
  }

  return [...accessibleIds].map((id) => new mongoose.Types.ObjectId(id));
};

const requireProjectAccess = (permission = 'read') => async (req, res, next) => {
  const projectId = getProjectId(req);

  if (!projectId) {
    await removeUploadedFiles(req);
    return res.status(400).json({ message: 'Project ID is required.' });
  }

  try {
    const access = await resolveProjectAccess(req.user, projectId);
    if (!access) {
      await removeUploadedFiles(req);
      return res.status(404).json({ message: 'Project not found or you do not have access to it.' });
    }
    if (!access.permissions.has(permission)) {
      await removeUploadedFiles(req);
      return res.status(403).json({ message: `You do not have ${permission} access to this project.` });
    }

    req.project = access.project;
    req.projectMembership = access.membership;
    req.projectPermissions = access.permissions;
    return next();
  } catch (error) {
    await removeUploadedFiles(req);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid project ID.' });
    }

    return res.status(500).json({
      message: 'Project access could not be verified.',
      error: error.message,
    });
  }
};

const requireTaskProjectAccess = (permission = 'read') => async (req, res, next) => {
  const Task = require('../models/Task');
  try {
    const task = await Task.findById(req.params.taskId).select('project');
    if (!task) return res.status(404).json({ message: 'Task not found.' });
    const access = await resolveProjectAccess(req.user, task.project);
    if (!access) return res.status(404).json({ message: 'Task not found or access denied.' });
    if (!access.permissions.has(permission)) {
      return res.status(403).json({ message: `You do not have ${permission} access to this project.` });
    }
    req.project = access.project;
    req.projectMembership = access.membership;
    req.projectPermissions = access.permissions;
    req.taskProjectId = task.project;
    return next();
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ message: 'Invalid task ID.' });
    return res.status(500).json({ message: 'Task access could not be verified.', error: error.message });
  }
};

const requireProjectRoles = (...allowedRoles) => async (req, res, next) => {
  try {
    const access = await resolveProjectAccess(req.user, req.project?._id || getProjectId(req));
    if (!access) {
      return res.status(404).json({ message: 'Project not found or you do not have access to it.' });
    }

    if (!allowedRoles.includes(access.role)) {
      return res.status(403).json({
        message: `Access denied. Required project role: ${allowedRoles.join(' or ')}.`,
      });
    }
    req.project = access.project;
    req.projectMembership = access.membership;
    req.projectPermissions = access.permissions;
    return next();
  } catch (error) {
    return res.status(500).json({
      message: 'Project role could not be verified.',
      error: error.message,
    });
  }
};

module.exports = {
  getProjectId,
  resolveProjectAccess,
  getAccessibleProjectIds,
  requireProjectAccess,
  requireTaskProjectAccess,
  requireProjectRoles,
};
