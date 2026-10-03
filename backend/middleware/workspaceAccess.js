const Workspace = require('../models/Workspace');

const requireWorkspaceAccess = async (req, res, next) => {
  const workspaceId = req.params.workspaceId || req.body.workspace || req.query.workspaceId;

  if (!workspaceId) {
    return res.status(400).json({ message: 'Workspace ID is required.' });
  }

  try {
    const workspace = await Workspace.findOne({
      _id: workspaceId,
      $or: [
        { owner: req.user._id },
        { members: req.user._id },
      ],
    });

    if (!workspace && req.user.role !== 'admin') {
      return res.status(404).json({ message: 'Workspace not found or access denied.' });
    }

    req.workspace = workspace || await Workspace.findById(workspaceId);
    if (!req.workspace) {
      return res.status(404).json({ message: 'Workspace not found.' });
    }

    next();
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

module.exports = requireWorkspaceAccess;
