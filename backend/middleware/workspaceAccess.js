const Workspace = require('../models/Workspace');

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

    req.workspace = workspace;

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

const requireWorkspaceAdmin = async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Workspace administrator access is required.' });
  }

  return requireWorkspaceAccess(req, res, () => {
    if (req.workspace.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only this workspace’s administrator can manage it.' });
    }
    return next();
  });
};

module.exports = requireWorkspaceAccess;
module.exports.requireWorkspaceAdmin = requireWorkspaceAdmin;
