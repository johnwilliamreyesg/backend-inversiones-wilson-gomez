const { z } = require('../config/validation');
const { paginationSchema, optionalText, isoDate, moneyAmount, queryBoolean } = require('./common.validators');

const positiveId = (label) =>
  z.coerce.number(`El ${label} es obligatorio.`).int().positive(`El ${label} debe ser un id positivo.`);

const paymentMethod = z.enum(['cash', 'transfer'], {
  error: 'El medio de pago debe ser "cash" (efectivo) o "transfer" (transferencia).',
});

const loanIdParamSchema = z.object({ loanId: positiveId('crédito') });

const paymentType = z.enum(['installment', 'interest_only', 'principal'], {
  error: 'El tipo de pago debe ser "installment" (cuota), "interest_only" (solo intereses) o "principal" (abono a capital).',
});

const recalculation = z.enum(['reduce_installment', 'reduce_term'], {
  error: 'El recálculo debe ser "reduce_installment" (bajar las cuotas) o "reduce_term" (acortar el plazo).',
});

// paymentDate is optional: the service defaults it to today and rejects future dates.
// recalculation: only for a principal prepayment; the service requires it when
// the prepayment changes the installments of a fixed-term loan.
const registerPaymentSchema = z
  .object({
    amount: moneyAmount,
    paymentDate: isoDate().optional(),
    paymentMethod: paymentMethod.default('cash'),
    paymentType: paymentType.default('installment'),
    recalculation: recalculation.optional(),
    notes: optionalText(2000),
  })
  .refine((body) => !body.recalculation || body.paymentType === 'principal', {
    message: 'El recálculo solo aplica a un abono a capital.',
    path: ['recalculation'],
  });

const voidPaymentSchema = z.object({
  reason: z
    .string('El motivo es obligatorio.')
    .trim()
    .min(5, 'Explique el motivo (mínimo 5 caracteres).')
    .max(255, 'El motivo admite máximo 255 caracteres.'),
});

const listPaymentsQuerySchema = paginationSchema
  .extend({
    from: isoDate('"from" debe tener el formato AAAA-MM-DD.').optional(),
    to: isoDate('"to" debe tener el formato AAAA-MM-DD.').optional(),
    loanId: positiveId('crédito').optional(),
    receivedBy: positiveId('usuario').optional(),
    paymentMethod: paymentMethod.optional(),
    includeVoided: queryBoolean.default(false),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'La fecha inicial no puede ser posterior a la final.',
    path: ['from'],
  });

const listCollectionsQuerySchema = z.object({
  date: isoDate().optional(),
  frequency: z.enum(['monthly', 'biweekly']).optional(),
  search: z.string().trim().max(100).optional(),
  onlyOverdue: queryBoolean.default(false),
});

module.exports = {
  loanIdParamSchema,
  registerPaymentSchema,
  voidPaymentSchema,
  listPaymentsQuerySchema,
  listCollectionsQuerySchema,
};
