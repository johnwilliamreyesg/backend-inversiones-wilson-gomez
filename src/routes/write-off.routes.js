const { Router } = require('express');
const { validateRequest } = require('../middlewares/validate-request');
const { authorize } = require('../middlewares/authorize');
const { idParamSchema } = require('../validators/common.validators');
const { writeOffClientSchema, renegotiateLoanSchema } = require('../validators/write-off.validators');
const { WRITE_OFF_PERMISSION } = require('../security/access-control');

// Mounted behind `authenticate` at /written-off. Every route needs portfolio.write_off.
const createWriteOffRoutes = ({ writeOffController }) => {
  const router = Router();
  router.use(authorize(WRITE_OFF_PERMISSION));

  router.get('/', writeOffController.list);
  router.post(
    '/clients/:id',
    validateRequest({ params: idParamSchema, body: writeOffClientSchema }),
    writeOffController.writeOffClient,
  );
  router.post(
    '/loans/:id/renegotiate',
    validateRequest({ params: idParamSchema, body: renegotiateLoanSchema }),
    writeOffController.renegotiate,
  );

  return router;
};

module.exports = { createWriteOffRoutes };
