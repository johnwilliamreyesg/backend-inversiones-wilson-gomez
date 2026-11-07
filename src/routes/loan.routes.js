const { Router } = require('express');
const { validateRequest } = require('../middlewares/validate-request');
const { authorize } = require('../middlewares/authorize');
const { idParamSchema } = require('../validators/common.validators');
const {
  createLoanSchema,
  previewLoanSchema,
  listLoansQuerySchema,
  installmentParamsSchema,
  rescheduleInstallmentSchema,
} = require('../validators/loan.validators');
const { createLoanPaymentRoutes } = require('./payment.routes');

// Mounted behind `authenticate` (see routes/index.js), so req.user always exists here.
// Middleware order per route: permission check -> input validation -> controller.
const createLoanRoutes = (controllers) => {
  const { loanController } = controllers;
  const router = Router();

  // Nested resource: /loans/:loanId/payments
  router.use('/:loanId/payments', createLoanPaymentRoutes(controllers));

  // Before '/:id' so "preview" is not read as an id.
  router.post(
    '/preview',
    authorize('loans.create'),
    validateRequest({ body: previewLoanSchema }),
    loanController.preview,
  );
  router.get(
    '/',
    authorize('loans.read'),
    validateRequest({ query: listLoansQuerySchema }),
    loanController.list,
  );
  router.get(
    '/:id',
    authorize('loans.read'),
    validateRequest({ params: idParamSchema }),
    loanController.getById,
  );
  router.post(
    '/',
    authorize('loans.create'),
    validateRequest({ body: createLoanSchema }),
    loanController.create,
  );
  router.patch(
    '/:id/installments/:installmentId/due-date',
    authorize('loans.update'),
    validateRequest({ params: installmentParamsSchema, body: rescheduleInstallmentSchema }),
    loanController.rescheduleInstallment,
  );
  router.post(
    '/:id/cancel',
    authorize('loans.update'),
    validateRequest({ params: idParamSchema }),
    loanController.cancel,
  );

  return router;
};

module.exports = { createLoanRoutes };
