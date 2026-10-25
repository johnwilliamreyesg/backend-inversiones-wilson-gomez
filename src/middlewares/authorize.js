const { ForbiddenError, UnauthorizedError } = require('../errors/app-error');

/**
 * Requires the logged-in user to have ALL the given permission codes.
 * Must run after `authenticate`.
 *
 * Usage: router.post('/', authorize('clients.create'), controller.create)
 */
const authorize =
  (...requiredPermissions) =>
  (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Debe iniciar sesión.'));
    }

    const granted = new Set(req.user.permissions);
    const hasAll = requiredPermissions.every((permission) => granted.has(permission));

    return hasAll ? next() : next(new ForbiddenError());
  };

module.exports = { authorize };
