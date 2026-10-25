const { Router } = require('express');
const { validateRequest } = require('../middlewares/validate-request');
const { createLoginRateLimiter } = require('../middlewares/rate-limiters');
const { loginSchema, changePasswordSchema } = require('../validators/auth.validators');

const createAuthRoutes = ({ authController }, { authenticate }) => {
  const router = Router();

  // Public
  router.post(
    '/login',
    createLoginRateLimiter(),
    validateRequest({ body: loginSchema }),
    authController.login,
  );

  // Any logged-in user
  router.get('/me', authenticate, authController.me);
  router.patch(
    '/password',
    authenticate,
    validateRequest({ body: changePasswordSchema }),
    authController.changePassword,
  );

  return router;
};

module.exports = { createAuthRoutes };
