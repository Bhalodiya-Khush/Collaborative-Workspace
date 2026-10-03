const fs = require('fs/promises');
const mongoose = require('mongoose');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const Workspace = require('../models/Workspace');

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

  if (user.role === 'admin') {
    return {
      project,
      membership: null,
      permissions: new Set(permissionNames),
    };
  }

  const workspace = await Workspace.findOne({
    _id: project.workspace,
    status: 'active',
    $or: [{ owner: user._id }, { members: user._id }],
  }).select('_id');
  if (!workspace) return null;

  if (project.projectManager.toString() === user._id.toString()
    && user.role === 'project_manager') {
    return {
      project,
      membership: null,
      permissions: new Set(permissionNames),
    };
  }

  const existingMembership = await ProjectMember.findOne({
    project: project._id,
    user: user._id,
  });
  let membership = existingMembership?.isActive ? existingMembership : null;

  // Support older projects until their project-member records are migrated.
  if (!existingMembership && user.role === 'developer'
    && project.developers.some((developer) => developer.toString() === user._id.toString())) {
    membership = {
      role: 'developer',
      accessLevel: 'write',
    };
  }
  if (!membership) return null;

  const permissions = new Set(['read']);
  if (membership.role === 'project_manager' && user.role === 'project_manager'
    && membership.accessLevel === 'admin') {
    permissions.add('write');
    permissions.add('review');
    permissions.add('manage');
  } else if (membership.role === 'developer' && user.role === 'developer'
    && ['write', 'admin'].includes(membership.accessLevel)) {
    permissions.add('write');
  } else if (membership.role === 'reviewer') {
    permissions.add('review');
  }

  return { project, membership, permissions };
};

const getAccessibleProjectIds = async (user, permission = 'read') => {
  if (!permissionNames.includes(permission)) {
    throw new Error(`Unknown project permission: ${permission}`);
  }
  if (user.role === 'admin') {
    return Project.find().distinct('_id');
  }

  const workspaceIds = await Workspace.find({
    status: 'active',
    $or: [{ owner: user._id }, { members: user._id }],
  }).distinct('_id');
  if (!workspaceIds.length) return [];

  const workspaceProjectIds = await Project.find({ workspace: { $in: workspaceIds } }).distinct('_id');
  if (!workspaceProjectIds.length) return [];

  const projectIds = new Set();
  if (permission === 'read') {
    const [asManager, memberships] = await Promise.all([
      user.role === 'project_manager'
        ? Project.find({ projectManager: user._id, workspace: { $in: workspaceIds } }).distinct('_id')
        : [],
      ProjectMember.find({
        user: user._id,
        isActive: true,
        project: { $in: workspaceProjectIds },
      }).distinct('project'),
    ]);
    [...asManager, ...memberships].forEach((id) => projectIds.add(id.toString()));
    if (user.role === 'developer') {
      const projectsWithMembershipRecords = await ProjectMember.find({
        user: user._id,
        project: { $in: workspaceProjectIds },
      }).distinct('project');
      const legacyProjects = await Project.find({
        workspace: { $in: workspaceIds },
        developers: user._id,
        _id: {
          $in: workspaceProjectIds,
          $nin: [...projectIds, ...projectsWithMembershipRecords],
        },
      }).distinct('_id');
      legacyProjects.forEach((id) => projectIds.add(id.toString()));
    }
  } else {
    const memberships = await ProjectMember.find({
      user: user._id,
      isActive: true,
      project: { $in: workspaceProjectIds },
    }).select('project role accessLevel');
    for (const membership of memberships) {
      const access = await resolveProjectAccess(user, membership.project);
      if (access && access.permissions.has(permission)) projectIds.add(membership.project.toString());
    }
    if (user.role === 'project_manager' && ['write', 'review', 'manage'].includes(permission)) {
      const managed = await Project.find({
        projectManager: user._id,
        workspace: { $in: workspaceIds },
      }).distinct('_id');
      managed.forEach((id) => projectIds.add(id.toString()));
    }
  }

  return [...projectIds].map((id) => new mongoose.Types.ObjectId(id));
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

module.exports = {
  getProjectId,
  resolveProjectAccess,
  getAccessibleProjectIds,
  requireProjectAccess,
  requireTaskProjectAccess,
};
