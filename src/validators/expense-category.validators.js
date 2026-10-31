const { z } = require('../config/validation');
const { queryBoolean } = require('./common.validators');

const name = z
  .string('El nombre es obligatorio.')
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres.')
  .max(100, 'El nombre admite máximo 100 caracteres.');

const createExpenseCategorySchema = z.object({ name });

// Categories are never deleted (expenses reference them): they are deactivated.
const updateExpenseCategorySchema = z
  .object({
    name,
    isActive: z.boolean('isActive debe ser true o false.'),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Envíe al menos un campo para actualizar.');

const listExpenseCategoriesQuerySchema = z.object({
  includeInactive: queryBoolean.default(false),
});

module.exports = {
  createExpenseCategorySchema,
  updateExpenseCategorySchema,
  listExpenseCategoriesQuerySchema,
};
