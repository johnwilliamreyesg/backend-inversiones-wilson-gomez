const { Router } = require('express');
const { validateRequest } = require('../middlewares/validate-request');
const { authorize } = require('../middlewares/authorize');
const { idParamSchema } = require('../validators/common.validators');
const {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  listUsersQuerySchema,
} = require('../validators/user.validators');
const { USERS_MANAGE_PERMISSION } = require('../security/access-control');

// Mounted behind `authenticate` (see routes/index.js). Every route needs users.manage.
const createUserRoutes = ({ userController }) => {
  const router = Router();
  router.use(authorize(USERS_MANAGE_PERMISSION));

  router.get('/', validateRequest({ query: listUsersQuerySchema }), userController.list);
  router.get('/:id', validateRequest({ params: idParamSchema }), userController.getById);
  router.post('/', validateRequest({ body: createUserSchema }), userController.create);
  router.patch(
    '/:id',
    validateRequest({ params: idParamSchema, body: updateUserSchema }),
    userController.update,
  );
  router.put(
    '/:id/password',
    validateRequest({ params: idParamSchema, body: resetPasswordSchema }),
    userController.resetPassword,
  );

  return router;
};

module.exports = { createUserRoutes };
