const { Router } = require('express');
const { validateRequest } = require('../middlewares/validate-request');
const { authorize } = require('../middlewares/authorize');
const { idParamSchema } = require('../validators/common.validators');
const {
  loanIdParamSchema,
  registerPaymentSchema,
  voidPaymentSchema,
  listPaymentsQuerySchema,
  listCollectionsQuerySchema,
} = require('../validators/payment.validators');

// Mounted behind `authenticate` (see routes/index.js), so req.user always exists here.

// /payments: every payment (cash count, history) and voiding.
const createPaymentRoutes = ({ paymentController }) => {
  const router = Router();
  router.get(
    '/',
    authorize('payments.read'),
    validateRequest({ query: listPaymentsQuerySchema }),
    paymentController.list,
  );
  router.get(
    '/:id',
    authorize('payments.read'),
    validateRequest({ params: idParamSchema }),
    paymentController.getById,
  );
  router.post(
    '/:id/void',
    authorize('payments.void'),
    validateRequest({ params: idParamSchema, body: voidPaymentSchema }),
    paymentController.void,
  );
  return router;
};

// /loans/:loanId/payments: payments of one loan.
const createLoanPaymentRoutes = ({ paymentController }) => {
  const router = Router({ mergeParams: true });
  router.get(
    '/',
    authorize('payments.read'),
    validateRequest({ params: loanIdParamSchema }),
    paymentController.listByLoan,
  );
  router.post(
    '/',
    authorize('payments.create'),
    validateRequest({ params: loanIdParamSchema, body: registerPaymentSchema }),
    paymentController.register,
  );
  return router;
};

// /collections: today's collection list.
const createCollectionRoutes = ({ collectionController }) => {
  const router = Router();
  router.get(
    '/',
    authorize('payments.read'),
    validateRequest({ query: listCollectionsQuerySchema }),
    collectionController.listDue,
  );
  return router;
};

module.exports = { createPaymentRoutes, createLoanPaymentRoutes, createCollectionRoutes };
