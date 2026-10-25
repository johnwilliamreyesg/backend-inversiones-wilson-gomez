const { NotFoundError } = require('../errors/app-error');

// Runs when no route matched the request.
const notFoundHandler = (req, res, next) => {
  next(new NotFoundError(`La ruta ${req.method} ${req.originalUrl} no existe.`));
};

module.exports = { notFoundHandler };
