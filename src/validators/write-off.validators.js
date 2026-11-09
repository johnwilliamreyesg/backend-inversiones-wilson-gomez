const { z } = require('../config/validation');
const { isoDate, moneyAmount, optionalText } = require('./common.validators');

const writeOffClientSchema = z.object({
  reason: z
    .string('El motivo es obligatorio.')
    .trim()
    .min(5, 'Explique el motivo (mínimo 5 caracteres).')
    .max(255, 'El motivo admite máximo 255 caracteres.'),
});

// New payment agreement for a written-off loan.
const renegotiateLoanSchema = z.object({
  agreedAmount: moneyAmount,
  numberOfInstallments: z.coerce
    .number('El número de cuotas debe ser un número.')
    .int('El número de cuotas debe ser entero.')
    .min(1, 'Debe haber al menos 1 cuota.')
    .max(120, 'Máximo 120 cuotas.'),
  frequency: z.enum(['monthly', 'biweekly'], {
    error: 'La frecuencia debe ser "monthly" (mensual) o "biweekly" (quincenal).',
  }),
  firstDueDate: isoDate('La fecha de la primera cuota debe tener el formato AAAA-MM-DD.'),
  notes: optionalText(2000),
});

module.exports = { writeOffClientSchema, renegotiateLoanSchema };
