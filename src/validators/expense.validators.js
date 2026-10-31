const { z } = require('../config/validation');
const { paginationSchema, isoDate, moneyAmount } = require('./common.validators');

const categoryId = z.coerce
  .number('La categoría es obligatoria.')
  .int()
  .positive('La categoría debe ser un id positivo.');

const description = z
  .string('La descripción es obligatoria.')
  .trim()
  .min(3, 'La descripción debe tener al menos 3 caracteres.')
  .max(255, 'La descripción admite máximo 255 caracteres.');

// expenseDate is optional: the service defaults it to today (client's time zone)
// and rejects future dates, because "today" depends on the clock, not on the input.
const createExpenseSchema = z.object({
  categoryId,
  expenseDate: isoDate().optional(),
  amount: moneyAmount,
  description,
});

const updateExpenseSchema = z
  .object({ categoryId, expenseDate: isoDate(), amount: moneyAmount, description })
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Envíe al menos un campo para actualizar.');

const listExpensesQuerySchema = paginationSchema
  .extend({
    from: isoDate('"from" debe tener el formato AAAA-MM-DD.').optional(),
    to: isoDate('"to" debe tener el formato AAAA-MM-DD.').optional(),
    categoryId: categoryId.optional(),
    search: z.string().trim().max(100).optional(),
  })
  // 'YYYY-MM-DD' strings compare correctly as text.
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'La fecha inicial no puede ser posterior a la final.',
    path: ['from'],
  });

module.exports = { createExpenseSchema, updateExpenseSchema, listExpensesQuerySchema };
