const { Router } = require('express');
const { createHealthRoutes } = require('./health.routes');
const { createAuthRoutes } = require('./auth.routes');
const { createFileRoutes } = require('./file.routes');
const { createClientRoutes } = require('./client.routes');

// Single entry point for all API routes, mounted under /api in app.js.
const createApiRouter = (controllers, middlewares) => {
  const router = Router();

  // Public (auth.routes protects /me and /password itself)
  router.use('/health', createHealthRoutes(controllers));
  router.use('/auth', createAuthRoutes(controllers, middlewares));

  // Signed file links (only with the local storage driver)
  if (controllers.fileController) {
    router.use('/files', createFileRoutes(controllers));
  }

  // Everything below requires a logged-in user
  router.use('/clients', middlewares.authenticate, createClientRoutes(controllers));

  return router;
};

module.exports = { createApiRouter };
