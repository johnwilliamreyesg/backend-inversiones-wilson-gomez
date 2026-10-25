const { Router } = require('express');
const { validateRequest } = require('../middlewares/validate-request');
const { idParamSchema } = require('../validators/common.validators');
const {
  createClientSchema,
  updateClientSchema,
  listClientsQuerySchema,
} = require('../validators/client.validators');

const createClientRoutes = ({ clientController }) => {
  const router = Router();

  router.get('/', validateRequest({ query: listClientsQuerySchema }), clientController.list);
  router.get('/:id', validateRequest({ params: idParamSchema }), clientController.getById);
  router.post('/', validateRequest({ body: createClientSchema }), clientController.create);
  router.patch(
    '/:id',
    validateRequest({ params: idParamSchema, body: updateClientSchema }),
    clientController.update,
  );
  router.delete('/:id', validateRequest({ params: idParamSchema }), clientController.delete);

  return router;
};

module.exports = { createClientRoutes };
