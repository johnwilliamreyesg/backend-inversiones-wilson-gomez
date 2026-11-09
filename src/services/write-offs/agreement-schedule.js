const { toCents, fromCents, roundCents } = require('../../utils/money');
const { parse, dateInMonth, addMonths, addDays } = require('../../utils/calendar-dates');

const BIWEEKLY_GAP_DAYS = 15;

/** `total` cents in `count` equal parts (rounded down to the unit); the last one takes the remainder. */
const equalParts = (total, count, unitCents) => {
  const regular = roundCents(total / count, unitCents, 'down');
  return Array.from({ length: count }, (_, index) => (index === count - 1 ? total - regular * (count - 1) : regular));
};

const agreementDates = ({ firstDueDate, numberOfInstallments, frequency }) => {
  const { year, month, day } = parse(firstDueDate);
  return Array.from({ length: numberOfInstallments }, (_, index) => {
    if (frequency === 'biweekly') return addDays(firstDueDate, BIWEEKLY_GAP_DAYS * index);
    const target = addMonths(year, month, index);
    return dateInMonth(target.year, target.month, day);
  });
};

/**
 * Payment agreement for a written-off loan ("nuevo acuerdo de pago"). Pure
 * calculation (no database).
 *
 * Of the agreed amount, up to the principal still owed counts as principal;
 * anything above it counts as interest. Principal the agreement does not cover
 * is forgiven. Both parts are spread in equal installments, monthly (same day
 * of the month as the first one) or every 15 days.
 */
const buildAgreementSchedule = ({
  previousBalance,
  agreedAmount,
  numberOfInstallments,
  frequency,
  firstDueDate,
  firstInstallmentNumber,
  roundingUnitCents,
}) => {
  const balanceCents = toCents(previousBalance);
  const agreedCents = toCents(agreedAmount);
  const principalCents = Math.min(agreedCents, balanceCents);
  const interestCents = agreedCents - principalCents;

  const principals = equalParts(principalCents, numberOfInstallments, roundingUnitCents);
  const interests = equalParts(interestCents, numberOfInstallments, roundingUnitCents);
  const dates = agreementDates({ firstDueDate, numberOfInstallments, frequency });

  return {
    principalBalance: fromCents(principalCents),
    forgivenPrincipal: fromCents(balanceCents - principalCents),
    installments: dates.map((dueDate, index) => ({
      installmentNumber: firstInstallmentNumber + index,
      dueDate,
      principalDue: fromCents(principals[index]),
      interestDue: fromCents(interests[index]),
      amountDue: fromCents(principals[index] + interests[index]),
    })),
  };
};

module.exports = { buildAgreementSchedule };
