const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const requireAuth = require('../middleware/auth');

const originalVerify = jwt.verify;
const originalFindById = User.findById;

const configureAuth = (decodedToken, user) => {
  jwt.verify = () => decodedToken;
  User.findById = () => ({
    select: async () => user,
  });
};

test.after(() => {
  jwt.verify = originalVerify;
  User.findById = originalFindById;
});

test('authentication accepts a current token version and keeps the version out of req.user', async () => {
  const user = {
    _id: 'user-id',
    role: 'developer',
    isActive: true,
    tokenVersion: 3,
    set(field, value) {
      this[field] = value;
    },
  };
  configureAuth({ userId: 'user-id', tokenVersion: 3 }, user);
  let nextCalled = false;
  const req = { headers: { authorization: 'Bearer valid-token' } };

  await requireAuth(req, { status() { return this; }, json() {} }, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user.role, 'developer');
  assert.equal(req.user.tokenVersion, undefined);
});

test('authentication rejects tokens invalidated by a password change', async () => {
  const user = {
    _id: 'user-id',
    role: 'developer',
    isActive: true,
    tokenVersion: 4,
    set(field, value) {
      this[field] = value;
    },
  };
  configureAuth({ userId: 'user-id', tokenVersion: 3 }, user);
  let responseStatus;
  let nextCalled = false;
  const res = {
    status(status) {
      responseStatus = status;
      return this;
    },
    json() {},
  };

  await requireAuth(
    { headers: { authorization: 'Bearer stale-token' } },
    res,
    () => { nextCalled = true; }
  );

  assert.equal(responseStatus, 401);
  assert.equal(nextCalled, false);
});
