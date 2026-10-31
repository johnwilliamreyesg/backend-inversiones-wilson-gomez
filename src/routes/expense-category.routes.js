const { Router } = require('express');
const { validateRequest } = require('../middlewares/validate-request');
const { authorize } = require('../middlewares/authorize');
const { idParamSchema } = require('../validators/common.validators');
const {
  createExpenseCategorySchema,
  updateExpenseCategorySchema,
  listExpenseCategoriesQuerySchema,
} = require('../validators/expense-category.validators');

// Mounted behind `authenticate` (see routes/index.js), so req.user always exists here.
// Phase 1 reuses the expense permissions; a dedicated one can be added with the roles screen.
const createExpenseCategoryRoutes = (controllers) => {
  const { expenseCategoryController } = controllers;
  const router = Router();

  router.get(
    '/',
    authorize('expenses.read'),
    validateRequest({ query: listExpenseCategoriesQuerySchema }),
    expenseCategoryController.list,
  );
  router.post(
    '/',
    authorize('expenses.create'),
    validateRequest({ body: createExpenseCategorySchema }),
    expenseCategoryController.create,
  );
  router.patch(
    '/:id',
    authorize('expenses.update'),
    validateRequest({ params: idParamSchema, body: updateExpenseCategorySchema }),
    expenseCategoryController.update,
  );

  return router;
};

module.exports = { createExpenseCategoryRoutes };
