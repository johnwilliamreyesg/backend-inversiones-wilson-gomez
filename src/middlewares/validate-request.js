const { ValidationError } = require('../errors/app-error');

const REQUEST_PARTS = ['params', 'query', 'body'];

/**
 * Validates request parts against Zod schemas before the controller runs.
 *
 * Usage: router.post('/', validateRequest({ body: createClientSchema }), controller.create)
 *
 * Parsed (clean, typed, defaulted) values are stored in `req.validated`
 * because Express 5 makes `req.query` read-only.
 */
const validateRequest = (schemas) => (req, res, next) => {
  const validated = {};
  const errors = [];

  for (const part of REQUEST_PARTS) {
    const schema = schemas[part];
    if (!schema) continue;

    const result = schema.safeParse(req[part] ?? {});
    if (result.success) {
      validated[part] = result.data;
    } else {
      errors.push(
        ...result.error.issues.map((issue) => ({
          location: part,
          field: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
  }

  if (errors.length > 0) {
    return next(new ValidationError(undefined, errors));
  }

  req.validated = validated;
  return next();
};

module.exports = { validateRequest };
