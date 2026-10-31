const { Router } = require('express');
const { validateRequest } = require('../middlewares/validate-request');
const { authorize } = require('../middlewares/authorize');
const { idParamSchema } = require('../validators/common.validators');
const { createRoleSchema, updateRoleSchema } = require('../validators/role.validators');
const { USERS_MANAGE_PERMISSION } = require('../security/access-control');

// Mounted behind `authenticate` (see routes/index.js). Every route needs users.manage.
const createRoleRoutes = ({ roleController }) => {
  const router = Router();
  router.use(authorize(USERS_MANAGE_PERMISSION));

  router.get('/', roleController.list);
  router.get('/:id', validateRequest({ params: idParamSchema }), roleController.getById);
  router.post('/', validateRequest({ body: createRoleSchema }), roleController.create);
  router.patch(
    '/:id',
    validateRequest({ params: idParamSchema, body: updateRoleSchema }),
    roleController.update,
  );
  router.delete('/:id', validateRequest({ params: idParamSchema }), roleController.delete);

  return router;
};

// Catalog of permissions to build the role form (checkboxes).
const createPermissionRoutes = ({ roleController }) => {
  const router = Router();
  router.get('/', authorize(USERS_MANAGE_PERMISSION), roleController.listPermissions);
  return router;
};

module.exports = { createRoleRoutes, createPermissionRoutes };
