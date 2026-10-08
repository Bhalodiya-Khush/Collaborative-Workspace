const jwt = require('jsonwebtoken');
const User = require('../models/User');

const getCookie = (request, name) => {
  const value = request.headers.cookie || '';
  const entry = value.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
};

const requireAuth = async (req, res, next) => {
  const authorization = req.headers.authorization;
  const bearerToken = authorization && authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : null;
  const token = bearerToken || getCookie(req, 'collaborativeWorkspaceToken');

  if (!token) {
    return res.status(401).json({ message: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User account is not available.' });
    }
    if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      res.clearCookie('collaborativeWorkspaceToken', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
      return res.status(401).json({ message: 'Your session is no longer valid. Please log in again.' });
    }

    user.set('tokenVersion', undefined);
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Your session has expired. Please log in again.' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid authentication token.' });
    }

    return res.status(500).json({ message: 'Authentication could not be verified.' });
  }
};

module.exports = requireAuth;
