const { toCents, fromCents, roundCents } = require('../../utils/money');
const { parse, daysInMonth, format, addMonths, addDays, daysBetween, dateInMonth } = require('../../utils/calendar-dates');
const { ValidationError } = require('../../errors/app-error');

// Ways to place the due dates of LEGACY biweekly loans (agreed installment):
const DUE_DATE_RULES = {
  // Every 15 days counted from the disbursement date.
  EVERY_15_DAYS: 'every_15_days',
  // The 15th and the last day of each month ("quincenas").
  FIXED_15_AND_END_OF_MONTH: 'fixed_15_and_end_of_month',
};

// A first due date closer than this to the disbursement is skipped
// (lending on the 13th and collecting on the 15th makes no sense).
const MIN_DAYS_TO_FIRST_FIXED_DATE = 8;

// Collection days when the loan does not say otherwise.
const DEFAULT_PAYMENT_DAYS = [15, 30];

/**
 * The next `count` dates that fall on one of `days` of the month (31 → last
 * day of shorter months), at least MIN_DAYS_TO_FIRST_FIXED_DATE after `startDate`.
 */
const datesOnDaysOfMonth = (startDate, count, days) => {
  const sortedDays = [...days].sort((a, b) => a - b);
  const dates = [];
  let { year, month } = parse(startDate);
  while (dates.length < count) {
    for (const day of sortedDays) {
      const candidate = dateInMonth(year, month, day);
      const last = dates[dates.length - 1];
      if (dates.length < count && daysBetween(startDate, candidate) >= MIN_DAYS_TO_FIRST_FIXED_DATE && (!last || candidate > last)) {
        dates.push(candidate);
      }
    }
    ({ year, month } = addMonths(year, month, 1));
  }
  return dates;
};

/** First date after `afterDate` that falls on one of `days` of the month. */
const nextDateOnDays = (afterDate, days) => {
  const sortedDays = [...days].sort((a, b) => a - b);
  let { year, month } = parse(afterDate);
  for (let guard = 0; guard < 3; guard += 1) {
    for (const day of sortedDays) {
      const candidate = dateInMonth(year, month, day);
      if (candidate > afterDate) return candidate;
    }
    ({ year, month } = addMonths(year, month, 1));
  }
  throw new Error('No next collection date found.');
};

/**
 * Biweekly loans (one installment per fortnight).
 *
 * With a rate (monthlyInterestRate): the same math as monthly loans, with
 * equal installments = principal / installments + HALF the monthly rate x the
 * initial principal (10 % a month = 5 % a fortnight), on the two collection
 * days of the month the loan chose (paymentDay, secondPaymentDay; default 15
 * and 30, i.e. the 15th and the last day).
 *
 * Legacy (installmentAmount): loans made before the rate existed keep their
 * agreed installment; the total interest is spread evenly
 * ($1.000.000 in 10 of $120.000 = $100.000 principal + $20.000 interest).
 */
class BiweeklyScheduleStrategy {
  constructor({ roundingUnitCents, dueDateRule = DUE_DATE_RULES.EVERY_15_DAYS }) {
    if (!Object.values(DUE_DATE_RULES).includes(dueDateRule)) {
      throw new Error(`Unknown biweekly due date rule: "${dueDateRule}".`);
    }
    this.roundingUnitCents = roundingUnitCents;
    this.dueDateRule = dueDateRule;
  }

  buildSchedule(terms) {
    return terms.monthlyInterestRate ? this.buildWithRate(terms) : this.buildWithAgreedInstallment(terms);
  }

  buildWithRate({ principalAmount, monthlyInterestRate, numberOfInstallments, startDate, paymentDay, secondPaymentDay }) {
    const [firstDay, secondDay] = [paymentDay ?? DEFAULT_PAYMENT_DAYS[0], secondPaymentDay ?? DEFAULT_PAYMENT_DAYS[1]].sort((a, b) => a - b);
    const principalCents = toCents(principalAmount);
    const regularPrincipal = roundCents(principalCents / numberOfInstallments, this.roundingUnitCents, 'down');
    const interest = this.fortnightInterestCents(principalCents, monthlyInterestRate);
    const dueDates = datesOnDaysOfMonth(startDate, numberOfInstallments, [firstDay, secondDay]);

    const installments = dueDates.map((dueDate, index) => {
      // The last installment takes the rounding remainder so principal adds up exactly.
      const isLast = index === numberOfInstallments - 1;
      const principal = isLast ? principalCents - regularPrincipal * (numberOfInstallments - 1) : regularPrincipal;
      return this.installment(index + 1, dueDate, principal, interest);
    });
    return { paymentDay: firstDay, secondPaymentDay: secondDay, installments };
  }

  buildWithAgreedInstallment({ principalAmount, installmentAmount, numberOfInstallments, startDate }) {
    const principalCents = toCents(principalAmount);
    const installmentCents = toCents(installmentAmount);
    const totalInterest = installmentCents * numberOfInstallments - principalCents;
    const regularInterest = roundCents(totalInterest / numberOfInstallments, this.roundingUnitCents, 'down');
    const dueDates = this.legacyDueDates(startDate, numberOfInstallments);

    const installments = dueDates.map((dueDate, index) => {
      const isLast = index === numberOfInstallments - 1;
      // The last installment takes the rounding remainder so totals add up exactly.
      const interest = isLast ? totalInterest - regularInterest * (numberOfInstallments - 1) : regularInterest;
      return this.installment(index + 1, dueDate, installmentCents - interest, interest);
    });

    // Only possible with absurd terms (a tiny principal over many installments).
    if (installments.some(({ principalDue }) => principalDue < 0)) {
      throw new ValidationError('Las condiciones del crédito no permiten repartir capital e interés.');
    }
    return { paymentDay: parse(dueDates[0]).day, installments };
  }

  /**
   * Interest of installments recalculated after a principal prepayment
   * (InstallmentRescheduler).
   * - With a rate: still equal, half the monthly rate on the principal left.
   * - Legacy (no rate): each installment keeps the share of its interest that
   *   matches the principal it still carries (half the principal, half the interest).
   * An installment left without principal has no interest either.
   */
  rescheduledInterestCents({ loan, installments, principalsCents }) {
    if (loan.monthlyInterestRate) {
      const principalLeft = principalsCents.reduce((total, cents) => total + cents, 0);
      const interest = this.fortnightInterestCents(principalLeft, loan.monthlyInterestRate);
      return principalsCents.map((principal) => (principal > 0 ? interest : 0));
    }
    return installments.map((installment, index) => {
      const before = toCents(installment.principalDue);
      const after = principalsCents[index];
      if (after === 0) return 0;
      if (before === 0) return toCents(installment.interestDue);
      return roundCents((toCents(installment.interestDue) * after) / before, this.roundingUnitCents);
    });
  }

  fortnightInterestCents(principalCents, monthlyInterestRate) {
    return roundCents((principalCents * monthlyInterestRate) / 2 / 100, this.roundingUnitCents);
  }

  legacyDueDates(startDate, count) {
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

  installment(installmentNumber, dueDate, principalCents, interestCents) {
    return {
      installmentNumber,
      dueDate,
      principalDue: fromCents(principalCents),
      interestDue: fromCents(interestCents),
      amountDue: fromCents(principalCents + interestCents),
    };
  }
}

module.exports = { BiweeklyScheduleStrategy, DUE_DATE_RULES, DEFAULT_PAYMENT_DAYS, nextDateOnDays };
