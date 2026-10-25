const { Router } = require('express');
const { createHealthRoutes } = require('./health.routes');
const { createClientRoutes } = require('./client.routes');

// Single entry point for all API routes, mounted under /api in app.js.
const createApiRouter = (controllers) => {
  const router = Router();

  router.use('/health', createHealthRoutes(controllers));
  router.use('/clients', createClientRoutes(controllers));

  return router;
};

module.exports = { createApiRouter };
