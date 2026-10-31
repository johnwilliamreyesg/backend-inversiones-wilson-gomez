const { Router } = require('express');
const { validateRequest } = require('../middlewares/validate-request');
const { authorize } = require('../middlewares/authorize');
const { idParamSchema } = require('../validators/common.validators');
const {
  createExpenseSchema,
  updateExpenseSchema,
  listExpensesQuerySchema,
} = require('../validators/expense.validators');

// Mounted behind `authenticate` (see routes/index.js), so req.user always exists here.
// Middleware order per route: permission check -> input validation -> controller.
const createExpenseRoutes = (controllers) => {
  const { expenseController } = controllers;
  const router = Router();

  router.get(
    '/',
    authorize('expenses.read'),
    validateRequest({ query: listExpensesQuerySchema }),
    expenseController.list,
  );
  router.get(
    '/:id',
    authorize('expenses.read'),
    validateRequest({ params: idParamSchema }),
    expenseController.getById,
  );
  router.post(
    '/',
    authorize('expenses.create'),
    validateRequest({ body: createExpenseSchema }),
    expenseController.create,
  );
  router.patch(
    '/:id',
    authorize('expenses.update'),
    validateRequest({ params: idParamSchema, body: updateExpenseSchema }),
    expenseController.update,
  );
  router.delete(
    '/:id',
    authorize('expenses.delete'),
    validateRequest({ params: idParamSchema }),
    expenseController.delete,
  );

  return router;
};

module.exports = { createExpenseRoutes };
