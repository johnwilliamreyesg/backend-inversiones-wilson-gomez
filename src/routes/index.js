const { Router } = require('express');
const { createHealthRoutes } = require('./health.routes');
const { createAuthRoutes } = require('./auth.routes');
const { createClientRoutes } = require('./client.routes');

// Single entry point for all API routes, mounted under /api in app.js.
const createApiRouter = (controllers, middlewares) => {
  const router = Router();

  // Public (auth.routes protects /me and /password itself)
  router.use('/health', createHealthRoutes(controllers));
  router.use('/auth', createAuthRoutes(controllers, middlewares));

  // Everything below requires a logged-in user
  router.use('/clients', middlewares.authenticate, createClientRoutes(controllers));

  return router;
};

module.exports = { createApiRouter };
