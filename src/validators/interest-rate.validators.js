const { z } = require('../config/validation');
const { queryBoolean } = require('./common.validators');

// Percentage per month: 10 means 10 %. NUMERIC(5,2) in the database,
// same rule as monthlyInterestRate in loan.validators.js.
const rate = z
  .number('La tasa es obligatoria.')
  .positive('La tasa debe ser mayor que cero.')
  .max(100, 'La tasa mensual no puede superar el 100 %.')
  .multipleOf(0.01, 'La tasa admite máximo 2 decimales.');

const createInterestRateSchema = z.object({ rate });

// Rates are never deleted (loans copy their value): they are deactivated.
const updateInterestRateSchema = z
  .object({
    rate,
    isActive: z.boolean('isActive debe ser true o false.'),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Envíe al menos un campo para actualizar.');

const listInterestRatesQuerySchema = z.object({
  includeInactive: queryBoolean.default(false),
});

module.exports = {
  interestRateValue: rate,
  createInterestRateSchema,
  updateInterestRateSchema,
  listInterestRatesQuerySchema,
};
