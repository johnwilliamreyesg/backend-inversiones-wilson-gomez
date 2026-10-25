const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { authorize } = require('../../../src/middlewares/authorize');
const { ForbiddenError, UnauthorizedError } = require('../../../src/errors/app-error');

// Runs the middleware and returns what it passed to next().
const run = (middleware, user) => {
  let received = 'not called';
  middleware({ user }, {}, (error) => {
    received = error;
  });
  return received;
};

describe('authorize', () => {
  const user = { id: 1, permissions: ['clients.read', 'clients.create'] };

  it('lets the request through when the user has the permission', () => {
    assert.equal(run(authorize('clients.read'), user), undefined);
  });

  it('requires ALL listed permissions', () => {
    assert.equal(run(authorize('clients.read', 'clients.create'), user), undefined);
    assert.ok(run(authorize('clients.read', 'clients.delete'), user) instanceof ForbiddenError);
  });

  it('returns 403 when the permission is missing', () => {
    assert.ok(run(authorize('reports.read'), user) instanceof ForbiddenError);
  });

  it('returns 401 when there is no logged-in user', () => {
    assert.ok(run(authorize('clients.read'), undefined) instanceof UnauthorizedError);
  });
});
