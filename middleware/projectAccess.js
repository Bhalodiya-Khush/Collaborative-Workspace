const Project = require('../models/Project');

const getProjectId = (req) => (
  req.params.projectId
  || req.params.id
  || req.body.project
  || req.query.projectId
);

const projectFilterForUser = (user) => {
  if (user.role === 'admin') {
    return {};
  }

  if (user.role === 'project_manager') {
    return { projectManager: user._id };
  }

  if (user.role === 'developer') {
    return { developers: user._id };
  }

  return { _id: null };
};

const requireProjectAccess = async (req, res, next) => {
  const projectId = getProjectId(req);

  if (!projectId) {
    return res.status(400).json({ message: 'Project ID is required.' });
  }

  try {
    const project = await Project.findOne({
      _id: projectId,
      ...projectFilterForUser(req.user),
    });

    if (!project) {
      return res.status(404).json({
        message: 'Project not found or you do not have access to it.',
      });
    }

    req.project = project;
    next();
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid project ID.' });
    }

    return res.status(500).json({
      message: 'Project access could not be verified.',
      error: error.message,
    });
  }
};

module.exports = {
  getProjectId,
  projectFilterForUser,
  requireProjectAccess,
};
