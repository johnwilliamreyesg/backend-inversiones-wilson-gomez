const { ConflictError, ValidationError } = require('./app-error');

// PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  NOT_NULL_VIOLATION: '23502',
  INVALID_TEXT_REPRESENTATION: '22P02',
};

/**
 * Translates a PostgreSQL constraint error into an AppError.
 * Services should validate first and give precise messages; this is the
 * safety net for anything that still reaches the database constraints.
 * Returns null when the error is not a known database error.
 */
const mapDatabaseError = (error) => {
  const details = { constraint: error.constraint };

  switch (error.code) {
    case PG_ERROR_CODES.UNIQUE_VIOLATION:
      return new ConflictError('Ya existe un registro con esos datos.', details);
    case PG_ERROR_CODES.FOREIGN_KEY_VIOLATION:
      return new ConflictError(
        'La operación no es posible porque el registro está relacionado con otros datos.',
        details,
      );
    case PG_ERROR_CODES.CHECK_VIOLATION:
    case PG_ERROR_CODES.NOT_NULL_VIOLATION:
      return new ValidationError('Los datos no cumplen las reglas del sistema.', details);
    case PG_ERROR_CODES.INVALID_TEXT_REPRESENTATION:
      return new ValidationError('Uno de los valores enviados tiene un formato inválido.');
    default:
      return null;
  }
};

module.exports = { mapDatabaseError, PG_ERROR_CODES };
