const { Router } = require('express');
const { validateRequest } = require('../middlewares/validate-request');
const { authorize } = require('../middlewares/authorize');
const { idParamSchema } = require('../validators/common.validators');
const {
  createInterestRateSchema,
  updateInterestRateSchema,
  listInterestRatesQuerySchema,
} = require('../validators/interest-rate.validators');
const { INTEREST_RATES_MANAGE_PERMISSION } = require('../security/access-control');

// Mounted behind `authenticate` (see routes/index.js), so req.user always exists here.
// Reading the catalog: whoever creates loans (the rate selector of the form).
const createInterestRateRoutes = ({ interestRateController }) => {
  const router = Router();

  router.get(
    '/',
    authorize('loans.create'),
    validateRequest({ query: listInterestRatesQuerySchema }),
    interestRateController.list,
  );
  router.post(
    '/',
    authorize(INTEREST_RATES_MANAGE_PERMISSION),
    validateRequest({ body: createInterestRateSchema }),
    interestRateController.create,
  );
  router.patch(
    '/:id',
    authorize(INTEREST_RATES_MANAGE_PERMISSION),
    validateRequest({ params: idParamSchema, body: updateInterestRateSchema }),
    interestRateController.update,
  );

  return router;
};

module.exports = { createInterestRateRoutes };
