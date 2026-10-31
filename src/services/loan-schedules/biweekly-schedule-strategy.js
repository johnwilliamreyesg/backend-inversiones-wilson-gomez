const { toCents, fromCents, roundCents } = require('../../utils/money');
const { parse, daysInMonth, format, addMonths, addDays, daysBetween } = require('../../utils/calendar-dates');
const { ValidationError } = require('../../errors/app-error');

// Ways to place biweekly due dates (pending confirmation from the client):
const DUE_DATE_RULES = {
  // Every 15 days counted from the disbursement date.
  EVERY_15_DAYS: 'every_15_days',
  // The 15th and the last day of each month ("quincenas").
  FIXED_15_AND_END_OF_MONTH: 'fixed_15_and_end_of_month',
};

// With fixed dates, a first due date closer than this to the disbursement
// is skipped (lending on the 13th and collecting on the 15th makes no sense).
const MIN_DAYS_TO_FIRST_FIXED_DATE = 8;

/**
 * Biweekly loans: a fixed agreed installment for a fixed number of installments
 * (e.g. $1.000.000 in 10 installments of $120.000).
 *
 * The total interest (installments x amount - principal) is spread evenly, so
 * every installment is exactly the agreed amount and the split is
 * $100.000 principal + $20.000 interest. Reports then treat both frequencies alike.
 */
class BiweeklyScheduleStrategy {
  constructor({ roundingUnitCents, dueDateRule = DUE_DATE_RULES.EVERY_15_DAYS }) {
    if (!Object.values(DUE_DATE_RULES).includes(dueDateRule)) {
      throw new Error(`Unknown biweekly due date rule: "${dueDateRule}".`);
    }
    this.roundingUnitCents = roundingUnitCents;
    this.dueDateRule = dueDateRule;
  }

  buildSchedule({ principalAmount, installmentAmount, numberOfInstallments, startDate }) {
    const principalCents = toCents(principalAmount);
    const installmentCents = toCents(installmentAmount);
    const totalInterest = installmentCents * numberOfInstallments - principalCents;
    const regularInterest = roundCents(totalInterest / numberOfInstallments, this.roundingUnitCents, 'down');
    const dueDates = this.dueDates(startDate, numberOfInstallments);

    const installments = dueDates.map((dueDate, index) => {
      const isLast = index === numberOfInstallments - 1;
      // The last installment takes the rounding remainder so totals add up exactly.
      const interest = isLast ? totalInterest - regularInterest * (numberOfInstallments - 1) : regularInterest;
      const principal = installmentCents - interest;
      return {
        installmentNumber: index + 1,
        dueDate,
        principalDue: fromCents(principal),
        interestDue: fromCents(interest),
        amountDue: fromCents(installmentCents),
      };
    });

    // Only possible with absurd terms (a tiny principal over many installments).
    if (installments.some(({ principalDue }) => principalDue < 0)) {
      throw new ValidationError('Las condiciones del crédito no permiten repartir capital e interés.');
    }

    return { paymentDay: parse(dueDates[0]).day, installments };
  }

  dueDates(startDate, count) {
    if (this.dueDateRule === DUE_DATE_RULES.EVERY_15_DAYS) {
      return Array.from({ length: count }, (_, index) => addDays(startDate, 15 * (index + 1)));
    }

    const dates = [];
    let { year, month } = parse(startDate);
    while (dates.length < count) {
      for (const day of [15, daysInMonth(year, month)]) {
        const candidate = format(year, month, day);
        if (dates.length < count && daysBetween(startDate, candidate) >= MIN_DAYS_TO_FIRST_FIXED_DATE) {
          dates.push(candidate);
        }
      }
      ({ year, month } = addMonths(year, month, 1));
    }
    return dates;
  }
}

module.exports = { BiweeklyScheduleStrategy, DUE_DATE_RULES };
