// Expected (operational) errors. Services throw these; the error handler
// turns them into HTTP responses. Anything else is treated as a bug (500).

class AppError extends Error {
  constructor(message, { statusCode = 500, code = 'INTERNAL_ERROR', details } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

class ValidationError extends AppError {
  constructor(message = 'Los datos enviados no son válidos.', details) {
    super(message, { statusCode: 400, code: 'VALIDATION_ERROR', details });
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Debe iniciar sesión.') {
    super(message, { statusCode: 401, code: 'UNAUTHORIZED' });
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'No tiene permiso para realizar esta acción.') {
    super(message, { statusCode: 403, code: 'FORBIDDEN' });
  }
}

class NotFoundError extends AppError {
  constructor(message = 'El recurso solicitado no existe.') {
    super(message, { statusCode: 404, code: 'NOT_FOUND' });
  }
}

class ConflictError extends AppError {
  constructor(message = 'La operación entra en conflicto con datos existentes.', details) {
    super(message, { statusCode: 409, code: 'CONFLICT', details });
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
};
