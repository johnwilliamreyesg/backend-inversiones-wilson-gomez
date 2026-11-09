const { z } = require('../config/validation');
const { paginationSchema, optionalText, isoDate, moneyAmount } = require('./common.validators');
const { interestRateValue } = require('./interest-rate.validators');

const MAX_INSTALLMENTS = 120;

const clientRef = (label) =>
  z.coerce.number(`El ${label} es obligatorio.`).int().positive(`El ${label} debe ser un id positivo.`);

const numberOfInstallments = z.coerce
  .number('El número de cuotas debe ser un número.')
  .int('El número de cuotas debe ser entero.')
  .min(1, 'Debe haber al menos 1 cuota.')
  .max(MAX_INSTALLMENTS, `Máximo ${MAX_INSTALLMENTS} cuotas.`);

// Fields shared by both frequencies. startDate is optional: the service
// defaults it to today and rejects future dates (needs the clock).
const baseTerms = {
  clientId: clientRef('cliente'),
  // Optional: a loan may have no co-debtor.
  coDebtorId: clientRef('codeudor').nullish().transform((value) => value ?? null),
  principalAmount: moneyAmount,
  startDate: isoDate().optional(),
  notes: optionalText(2000),
};

const monthlyTerms = z.object({
  ...baseTerms,
  frequency: z.literal('monthly'),
  // Percentage per month: 10 means 10 %. The service also checks that it is
  // an active rate of the catalog (interest_rates).
  monthlyInterestRate: interestRateValue,
  // Empty = open-ended (only interest each month, principal paid freely).
  numberOfInstallments: numberOfInstallments.optional(),
  paymentDay: z.coerce.number().int().min(1).max(31, 'El día de pago debe estar entre 1 y 31.').optional(),
});

const dayOfMonth = (label) => z.coerce.number().int().min(1).max(31, `El ${label} debe estar entre 1 y 31.`);

// Biweekly: same math as monthly (rate of the catalog, equal installments),
// one installment per fortnight, collected on two days of each month.
const biweeklyTerms = z.object({
  ...baseTerms,
  frequency: z.literal('biweekly'),
  monthlyInterestRate: interestRateValue,
  numberOfInstallments,
  paymentDay: dayOfMonth('primer día de cobro').default(15),
  secondPaymentDay: dayOfMonth('segundo día de cobro').default(30),
});

// The two collection days must be about a fortnight apart (at least 7 days either way round the month).
const MIN_DAYS_BETWEEN_COLLECTIONS = 7;
const collectionDaysApart = [
  (terms) => {
    if (terms.frequency !== 'biweekly') return true;
    const gap = Math.abs(terms.paymentDay - terms.secondPaymentDay);
    return gap >= MIN_DAYS_BETWEEN_COLLECTIONS && 31 - gap >= MIN_DAYS_BETWEEN_COLLECTIONS;
  },
  { message: 'Los dos días de cobro deben estar separados al menos 7 días (por ejemplo 15 y 30, o 5 y 20).', path: ['secondPaymentDay'] },
];
const FREQUENCY_ERROR = 'La frecuencia debe ser "monthly" (mensual) o "biweekly" (quincenal).';

// Same rules as the loans_terms_check and loans_co_debtor_check constraints.
const loanTermsSchema = z
  .discriminatedUnion('frequency', [monthlyTerms, biweeklyTerms], { error: FREQUENCY_ERROR })
  .refine((terms) => terms.clientId !== terms.coDebtorId, {
    message: 'El codeudor debe ser una persona distinta al cliente.',
    path: ['coDebtorId'],
  })
  .refine(...collectionDaysApart);

// The preview only needs the money terms, not who the parties are.
const previewLoanSchema = z
  .discriminatedUnion('frequency', [
    monthlyTerms.omit({ clientId: true, coDebtorId: true, notes: true }),
    biweeklyTerms.omit({ clientId: true, coDebtorId: true, notes: true }),
  ], { error: FREQUENCY_ERROR })
  .refine(...collectionDaysApart);

const listLoansQuerySchema = paginationSchema.extend({
  status: z.enum(['active', 'paid_off', 'defaulted', 'cancelled']).optional(),
  frequency: z.enum(['monthly', 'biweekly']).optional(),
  clientId: clientRef('cliente').optional(),
  search: z.string().trim().max(100).optional(),
});

const clientIdParamSchema = z.object({ clientId: clientRef('cliente') });

const installmentParamsSchema = z.object({
  id: clientRef('crédito'),
  installmentId: clientRef('cuota'),
});

// Move one installment, or it and the following ones, to a new date.
const rescheduleInstallmentSchema = z.object({
  dueDate: isoDate('La fecha debe tener el formato AAAA-MM-DD.'),
  applyToFollowing: z.boolean('applyToFollowing debe ser true o false.').default(false),
  reason: optionalText(255),
});

module.exports = {
  createLoanSchema: loanTermsSchema,
  previewLoanSchema,
  listLoansQuerySchema,
  clientIdParamSchema,
  installmentParamsSchema,
  rescheduleInstallmentSchema,
};
