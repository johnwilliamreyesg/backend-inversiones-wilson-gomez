const { UnauthorizedError } = require('../errors/app-error');

const BEARER_PATTERN = /^Bearer (\S+)$/;

/**
 * Requires a valid "Authorization: Bearer <token>" header and sets `req.user`
 * (id, fullName, email, roleName, permissions...). Rejects with 401 otherwise.
 */
const createAuthenticate =
  ({ authService }) =>
  async (req, res, next) => {
    const match = BEARER_PATTERN.exec(req.get('Authorization') ?? '');
    if (!match) {
      throw new UnauthorizedError('Debe iniciar sesión.');
    }

    req.user = await authService.resolveUser(match[1]);
    next();
  };

module.exports = { createAuthenticate };
