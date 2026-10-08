const allowRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const contextualRoles = new Set([
    req.workspaceRole,
    req.projectMembership?.role,
  ].filter(Boolean));
  if (!allowedRoles.some((role) => contextualRoles.has(role))) {
    return res.status(403).json({
      message: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
    });
  }

  next();
};

module.exports = allowRoles;
