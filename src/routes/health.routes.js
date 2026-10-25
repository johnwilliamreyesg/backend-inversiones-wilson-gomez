const { Router } = require('express');

// Maps URLs to controller methods (and, in other modules, middlewares like validation).
const createHealthRoutes = ({ healthController }) => {
  const router = Router();

  router.get('/', healthController.getStatus);

  return router;
};

module.exports = { createHealthRoutes };
