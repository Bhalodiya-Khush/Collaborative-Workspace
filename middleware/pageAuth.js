const jwt = require('jsonwebtoken');
const User = require('../models/User');

const getCookie = (req, name) => {
  const cookieHeader = req.headers.cookie || '';
  const cookie = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return cookie ? cookie.slice(name.length + 1) : null;
};

const requirePageAuth = async (req, res, next) => {
  const token = getCookie(req, 'collaborativeWorkspaceToken');
  if (!token) {
    return res.redirect('/login');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user || !user.isActive || (decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      res.clearCookie('collaborativeWorkspaceToken', { path: '/', sameSite: 'lax' });
      return res.redirect('/login');
    }

    user.set('tokenVersion', undefined);
    req.user = user;
    return next();
  } catch (error) {
    if (error.name !== 'JsonWebTokenError' && error.name !== 'TokenExpiredError') {
      return next(error);
    }

    res.clearCookie('collaborativeWorkspaceToken', { path: '/', sameSite: 'lax' });
    return res.redirect('/login');
  }
};

const allowPageRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).render('forbidden', { user: req.user });
  }

  return next();
};

module.exports = { requirePageAuth, allowPageRoles };
