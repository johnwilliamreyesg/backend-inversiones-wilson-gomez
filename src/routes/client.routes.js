const { Router } = require('express');
const { validateRequest } = require('../middlewares/validate-request');
const { authorize } = require('../middlewares/authorize');
const { idParamSchema } = require('../validators/common.validators');
const {
  createClientSchema,
  updateClientSchema,
  listClientsQuerySchema,
} = require('../validators/client.validators');

// Mounted behind `authenticate` (see routes/index.js), so req.user always exists here.
// Middleware order per route: permission check -> input validation -> controller.
const createClientRoutes = ({ clientController }) => {
  const router = Router();

  router.get(
    '/',
    authorize('clients.read'),
    validateRequest({ query: listClientsQuerySchema }),
    clientController.list,
  );
  router.get(
    '/:id',
    authorize('clients.read'),
    validateRequest({ params: idParamSchema }),
    clientController.getById,
  );
  router.post(
    '/',
    authorize('clients.create'),
    validateRequest({ body: createClientSchema }),
    clientController.create,
  );
  router.patch(
    '/:id',
    authorize('clients.update'),
    validateRequest({ params: idParamSchema, body: updateClientSchema }),
    clientController.update,
  );
  router.delete(
    '/:id',
    authorize('clients.delete'),
    validateRequest({ params: idParamSchema }),
    clientController.delete,
  );

  return router;
};

module.exports = { createClientRoutes };
