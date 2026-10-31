const { Router } = require('express');
const { createHealthRoutes } = require('./health.routes');
const { createAuthRoutes } = require('./auth.routes');
const { createFileRoutes } = require('./file.routes');
const { createClientRoutes } = require('./client.routes');
const { createExpenseRoutes } = require('./expense.routes');
const { createExpenseCategoryRoutes } = require('./expense-category.routes');
const { createUserRoutes } = require('./user.routes');
const { createLoanRoutes } = require('./loan.routes');
const { createPaymentRoutes, createCollectionRoutes } = require('./payment.routes');
const { createReportRoutes } = require('./report.routes');
const { createRoleRoutes, createPermissionRoutes } = require('./role.routes');

// Single entry point for all API routes, mounted under /api in app.js.
const createApiRouter = (controllers, middlewares) => {
  const router = Router();

  // Public (auth.routes protects /me and /password itself)
  router.use('/health', createHealthRoutes(controllers));
  router.use('/auth', createAuthRoutes(controllers, middlewares));

  // Signed file links (only with the local storage driver)
  if (controllers.fileController) {
    router.use('/files', createFileRoutes(controllers));
  }

  // Everything below requires a logged-in user
  router.use('/clients', middlewares.authenticate, createClientRoutes(controllers));
  router.use('/loans', middlewares.authenticate, createLoanRoutes(controllers));
  router.use('/payments', middlewares.authenticate, createPaymentRoutes(controllers));
  router.use('/collections', middlewares.authenticate, createCollectionRoutes(controllers));
  router.use('/reports', middlewares.authenticate, createReportRoutes(controllers));
  router.use('/expenses', middlewares.authenticate, createExpenseRoutes(controllers));
  router.use(
    '/expense-categories',
    middlewares.authenticate,
    createExpenseCategoryRoutes(controllers),
  );
  router.use('/users', middlewares.authenticate, createUserRoutes(controllers));
  router.use('/roles', middlewares.authenticate, createRoleRoutes(controllers));
  router.use('/permissions', middlewares.authenticate, createPermissionRoutes(controllers));

  return router;
};

module.exports = { createApiRouter };
