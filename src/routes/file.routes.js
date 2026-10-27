const { Router } = require('express');

// Public route: access is controlled by the link signature, not by a session,
// because <img src="..."> cannot send an Authorization header.
const createFileRoutes = ({ fileController }) => {
  const router = Router();

  router.get('/*key', fileController.serve);

  return router;
};

module.exports = { createFileRoutes };
