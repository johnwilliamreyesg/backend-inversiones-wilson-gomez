const { Router } = require('express');
const { createHealthRoutes } = require('./health.routes');

// Single entry point for all API routes, mounted under /api in app.js.
const createApiRouter = (controllers) => {
  const router = Router();

  router.use('/health', createHealthRoutes(controllers));

  return router;
};

module.exports = { createApiRouter };
