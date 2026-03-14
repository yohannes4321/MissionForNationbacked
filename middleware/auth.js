const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

function authRequired(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) {
    console.warn('[AUTH] Missing token', {
      method: req.method,
      path: req.originalUrl,
      ip: req.ip
    });
    return res.status(401).json({ error: 'Missing token' });
  }
  const parts = auth.split(' ');
  if (parts.length !== 2) {
    console.warn('[AUTH] Invalid auth format', {
      method: req.method,
      path: req.originalUrl,
      ip: req.ip
    });
    return res.status(401).json({ error: 'Invalid auth format' });
  }
  const token = parts[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = payload;
    next();
  } catch (err) {
    console.error('[AUTH] Token verification failed', {
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      error: err && err.message,
      name: err && err.name
    });
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      console.warn('[AUTH] Role check failed: not authenticated', {
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
        required_roles: roles
      });
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      console.warn('[AUTH] Role check failed: forbidden', {
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
        required_roles: roles,
        user_role: req.user.role,
        user_id: req.user.id
      });
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { authRequired, requireRole };
