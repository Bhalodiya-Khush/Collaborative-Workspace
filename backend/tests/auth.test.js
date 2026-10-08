const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const requireAuth = require('../middleware/auth');
const apiRouter = require('../routes/api');

const originalVerify = jwt.verify;
const originalFindById = User.findById;
const originalFindOne = User.findOne;
const originalJwtSecret = process.env.JWT_SECRET;

const configureAuth = (decodedToken, user) => {
  jwt.verify = () => decodedToken;
  User.findById = () => ({
    select: async () => user,
  });
};

test.after(() => {
  jwt.verify = originalVerify;
  User.findById = originalFindById;
  User.findOne = originalFindOne;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

test('authentication accepts a current token version and keeps the version out of req.user', async () => {
  const user = {
    _id: 'user-id',
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
  assert.equal(req.user.role, undefined);
  assert.equal(req.user.tokenVersion, undefined);
});

test('authentication accepts the HttpOnly browser cookie without an Authorization header', async () => {
  const user = {
    _id: 'user-id',
    isActive: true,
    tokenVersion: 2,
    set(field, value) {
      this[field] = value;
    },
  };
  configureAuth({ userId: 'user-id', tokenVersion: 2 }, user);
  let nextCalled = false;

  await requireAuth(
    { headers: { cookie: 'collaborativeWorkspaceToken=cookie-token' } },
    { status() { return this; }, json() {} },
    () => { nextCalled = true; }
  );

  assert.equal(nextCalled, true);
});

test('authentication rejects tokens invalidated by a password change', async () => {
  const user = {
    _id: 'user-id',
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
    clearCookie() {},
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

test('users with different Workspace roles can log in and authenticate through the same API flow', async () => {
  process.env.JWT_SECRET = 'role-regression-test-secret';
  jwt.verify = originalVerify;
  const accounts = new Map([
    ['user-a@example.test', { _id: '64b200000000000000000001', fullName: 'User A', email: 'user-a@example.test' }],
    ['user-b@example.test', { _id: '64b200000000000000000002', fullName: 'User B', email: 'user-b@example.test' }],
    ['user-c@example.test', { _id: '64b200000000000000000003', fullName: 'User C', email: 'user-c@example.test' }],
  ]);
  const passwordHash = await bcrypt.hash('password123', 4);
  const authenticatedAccounts = new Map();
  for (const account of accounts.values()) {
    account.password = passwordHash;
    account.isActive = true;
    account.tokenVersion = 0;
    account.set = function set(field, value) { this[field] = value; };
    account.toObject = function toObject() {
      return {
        _id: this._id,
        fullName: this.fullName,
        email: this.email,
        isActive: this.isActive,
      };
    };
    authenticatedAccounts.set(account._id, account);
  }
  User.findOne = async ({ email }) => accounts.get(email) || null;
  User.findById = (userId) => ({
    select: async () => authenticatedAccounts.get(userId) || null,
  });

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  try {
    const { port } = server.address();
    for (const account of accounts.values()) {
      const loginResponse = await fetch(`http://127.0.0.1:${port}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: account.email, password: 'password123' }),
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await loginResponse.json();
      assert.ok(loginBody.token);
      assert.equal(loginBody.user.role, undefined);

      const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/users/me`, {
        headers: { Authorization: `Bearer ${loginBody.token}` },
      });
      assert.equal(sessionResponse.status, 200);
      assert.equal((await sessionResponse.json()).user._id, account._id);
    }
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
