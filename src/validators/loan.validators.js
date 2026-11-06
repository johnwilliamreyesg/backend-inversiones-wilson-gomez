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
  coDebtorId: clientRef('codeudor'),
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

const biweeklyTerms = z.object({
  ...baseTerms,
  frequency: z.literal('biweekly'),
  installmentAmount: moneyAmount,
  numberOfInstallments,
});

// Biweekly: installments x amount must cover the principal (compared in cents).
const installmentsCoverPrincipal = [
  (terms) =>
    terms.frequency !== 'biweekly' ||
    Math.round(terms.installmentAmount * 100) * terms.numberOfInstallments >=
      Math.round(terms.principalAmount * 100),
  { message: 'Las cuotas no alcanzan a cubrir el capital prestado.', path: ['installmentAmount'] },
];
const FREQUENCY_ERROR = 'La frecuencia debe ser "monthly" (mensual) o "biweekly" (quincenal).';

// Same rules as the loans_terms_check and loans_co_debtor_check constraints.
const loanTermsSchema = z
  .discriminatedUnion('frequency', [monthlyTerms, biweeklyTerms], { error: FREQUENCY_ERROR })
  .refine((terms) => terms.clientId !== terms.coDebtorId, {
    message: 'El codeudor debe ser una persona distinta al cliente.',
    path: ['coDebtorId'],
  })
  .refine(...installmentsCoverPrincipal);

// The preview only needs the money terms, not who the parties are.
const previewLoanSchema = z
  .discriminatedUnion('frequency', [
    monthlyTerms.omit({ clientId: true, coDebtorId: true, notes: true }),
    biweeklyTerms.omit({ clientId: true, coDebtorId: true, notes: true }),
  ], { error: FREQUENCY_ERROR })
  .refine(...installmentsCoverPrincipal);

const listLoansQuerySchema = paginationSchema.extend({
  status: z.enum(['active', 'paid_off', 'defaulted', 'cancelled']).optional(),
  frequency: z.enum(['monthly', 'biweekly']).optional(),
  clientId: clientRef('cliente').optional(),
  search: z.string().trim().max(100).optional(),
});

const clientIdParamSchema = z.object({ clientId: clientRef('cliente') });

module.exports = {
  createLoanSchema: loanTermsSchema,
  previewLoanSchema,
  listLoansQuerySchema,
  clientIdParamSchema,
};
