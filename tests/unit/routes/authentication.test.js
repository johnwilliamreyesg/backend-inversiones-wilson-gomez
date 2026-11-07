const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../../src/app');
const { createAuthenticate } = require('../../../src/middlewares/authenticate');
const { UnauthorizedError } = require('../../../src/errors/app-error');

// Every endpoint that needs a session. A new route must be added here.
const PROTECTED_ENDPOINTS = [
  ['GET', '/api/auth/me'],
  ['PATCH', '/api/auth/password'],
  ['GET', '/api/clients'],
  ['POST', '/api/clients'],
  ['GET', '/api/clients/1'],
  ['PATCH', '/api/clients/1'],
  ['DELETE', '/api/clients/1'],
  ['GET', '/api/clients/1/loans'],
  ['GET', '/api/clients/1/photos'],
  ['PUT', '/api/clients/1/photos/1'],
  ['DELETE', '/api/clients/1/photos/1'],
  ['GET', '/api/loans'],
  ['POST', '/api/loans'],
  ['POST', '/api/loans/preview'],
  ['GET', '/api/loans/1'],
  ['POST', '/api/loans/1/cancel'],
  ['PATCH', '/api/loans/1/installments/1/due-date'],
  ['GET', '/api/loans/1/payments'],
  ['POST', '/api/loans/1/payments'],
  ['GET', '/api/interest-rates'],
  ['POST', '/api/interest-rates'],
  ['PATCH', '/api/interest-rates/1'],
  ['GET', '/api/payments'],
  ['GET', '/api/payments/1'],
  ['POST', '/api/payments/1/void'],
  ['GET', '/api/collections'],
  ['GET', '/api/collections/upcoming'],
  ['GET', '/api/reports/daily'],
  ['GET', '/api/reports/monthly'],
  ['GET', '/api/reports/portfolio'],
  ['GET', '/api/expenses'],
  ['POST', '/api/expenses'],
  ['GET', '/api/expenses/1'],
  ['PATCH', '/api/expenses/1'],
  ['DELETE', '/api/expenses/1'],
  ['GET', '/api/expense-categories'],
  ['POST', '/api/expense-categories'],
  ['PATCH', '/api/expense-categories/1'],
  ['GET', '/api/users'],
  ['POST', '/api/users'],
  ['GET', '/api/users/1'],
  ['PATCH', '/api/users/1'],
  ['PUT', '/api/users/1/password'],
  ['GET', '/api/roles'],
  ['POST', '/api/roles'],
  ['GET', '/api/roles/1'],
  ['PATCH', '/api/roles/1'],
  ['DELETE', '/api/roles/1'],
  ['GET', '/api/permissions'],
];

// Fake controllers: any action answers 200 and records that it was reached.
const reached = [];
const controllers = new Proxy(
  {},
  {
    get: (_, controllerName) =>
      new Proxy(
        {},
        {
          get: (__, action) => (req, res) => {
            reached.push(`${String(controllerName)}.${String(action)}`);
            res.json({ data: null });
          },
        },
      ),
  },
);

const authService = {
  resolveUser: async () => {
    throw new UnauthorizedError('Token inválido.');
  },
};

describe('Authentication on every endpoint', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createApp({
      controllers,
      middlewares: { authenticate: createAuthenticate({ authService }) },
      config: { isProduction: true, server: { corsOrigins: [] } },
    });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => server.close());

  const call = (method, path, headers = {}) =>
    fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers } });

  it('rejects every protected endpoint without a token (401) and never reaches the controller', async () => {
    reached.length = 0;
    for (const [method, path] of PROTECTED_ENDPOINTS) {
      const response = await call(method, path);
      assert.equal(response.status, 401, `${method} ${path} answered ${response.status}`);
    }
    assert.deepEqual(reached, []);
  });

  it('rejects an invalid token too', async () => {
    for (const [method, path] of PROTECTED_ENDPOINTS) {
      const response = await call(method, path, { Authorization: 'Bearer not-a-real-token' });
      assert.equal(response.status, 401, `${method} ${path} answered ${response.status}`);
    }
    assert.deepEqual(reached, []);
  });

  it('only health, login and signed file links are public', async () => {
    assert.equal((await call('GET', '/api/health')).status, 200);
    assert.notEqual((await call('POST', '/api/auth/login')).status, 401); // 400: empty body
    assert.equal((await call('GET', '/api/files/clients/1/photo.webp')).status, 200);
  });
});
