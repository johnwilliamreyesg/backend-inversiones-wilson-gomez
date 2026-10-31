const { z } = require('../config/validation');
const { isoDate } = require('./common.validators');

// Both optional: the service defaults to the current month up to today.
const dailyReportQuerySchema = z
  .object({
    from: isoDate('"from" debe tener el formato AAAA-MM-DD.').optional(),
    to: isoDate('"to" debe tener el formato AAAA-MM-DD.').optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'La fecha inicial no puede ser posterior a la final.',
    path: ['from'],
  });

const monthlyReportQuerySchema = z.object({
  year: z.coerce.number('El año debe ser un número.').int().min(2000).max(2100).optional(),
});

module.exports = { dailyReportQuerySchema, monthlyReportQuerySchema };
