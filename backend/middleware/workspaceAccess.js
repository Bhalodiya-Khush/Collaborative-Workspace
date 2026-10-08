const Workspace = require('../models/Workspace');
const WorkspaceMember = require('../models/WorkspaceMember');

const requireWorkspaceAccess = async (req, res, next) => {
  const workspaceId = req.params.workspaceId || req.body.workspace || req.query.workspaceId;

  if (!workspaceId) {
    return res.status(400).json({ message: 'Workspace ID is required.' });
  }

  try {
    const workspace = await Workspace.findOne({
      _id: workspaceId,
      status: 'active',
      $or: [
        { owner: req.user._id },
        { members: req.user._id },
      ],
    });

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found or access denied.' });
    }

    const membership = await WorkspaceMember.findOne({
      workspace: workspace._id,
      user: req.user._id,
      isActive: true,
    }).select('role');
    const isOwner = workspace.owner.toString() === req.user._id.toString();
    if (!isOwner && !membership) {
      return res.status(404).json({ message: 'Workspace not found or access denied.' });
    }

    req.workspace = workspace;
    req.workspaceRole = isOwner ? 'admin' : membership.role;

    return next();
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid workspace ID.' });
    }

    return res.status(500).json({
      message: 'Workspace access could not be verified.',
      error: error.message,
    });
  }
};

const requireWorkspaceRole = (...allowedRoles) => async (req, res, next) => {
  const verifyRole = async () => {
    let role = req.workspaceRole;
    if (!role) {
      const membership = await WorkspaceMember.findOne({
        workspace: req.workspace._id,
        user: req.user._id,
        isActive: true,
      }).select('role');
      role = req.workspace.owner.toString() === req.user._id.toString()
        ? 'admin'
        : membership?.role;
    }
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({
        message: `Access denied. Required workspace role: ${allowedRoles.join(' or ')}.`,
      });
    }
    req.workspaceRole = role;
    return next();
  };

  if (req.workspace) return verifyRole();
  return requireWorkspaceAccess(req, res, verifyRole);
};

module.exports = requireWorkspaceAccess;
module.exports.requireWorkspaceRole = requireWorkspaceRole;
module.exports.requireWorkspaceAdmin = requireWorkspaceRole('admin');
