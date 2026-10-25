const { AppError } = require('../errors/app-error');
const { mapDatabaseError } = require('../errors/database-error-mapper');

/**
 * Builds the last middleware of the app: every error ends here and leaves
 * with the same JSON shape: { error: { code, message, details? } }.
 * Express 5 forwards rejected promises from async handlers automatically.
 */
const createErrorHandler = ({ isProduction, logger = console }) =>
  // Express identifies error handlers by their 4 arguments, so `next` must stay.
  (error, req, res, next) => {
    // Malformed JSON body sent by the client.
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({
        error: { code: 'INVALID_JSON', message: 'El cuerpo de la petición no es un JSON válido.' },
      });
    }

    const appError = error instanceof AppError ? error : mapDatabaseError(error);

    if (appError) {
      return res.status(appError.statusCode).json({
        error: {
          code: appError.code,
          message: appError.message,
          ...(appError.details && { details: appError.details }),
        },
      });
    }

    // Unexpected error = bug. Log everything, reveal nothing in production.
    logger.error(error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Ocurrió un error inesperado.',
        ...(!isProduction && { details: { message: error.message, stack: error.stack } }),
      },
    });
  };

module.exports = { createErrorHandler };
