/**
 * Picks the schedule strategy for a loan frequency (Open/Closed principle):
 * a new frequency means a new strategy registered in container.js, with no
 * changes to this class or to LoanService.
 *
 * Every strategy implements buildSchedule(terms) -> { paymentDay, installments }.
 */
class LoanScheduleCalculator {
  constructor({ strategies }) {
    this.strategies = strategies; // { monthly: MonthlyScheduleStrategy, biweekly: ... }
  }

  forFrequency(frequency) {
    const strategy = this.strategies[frequency];
    if (!strategy) throw new Error(`No schedule strategy for frequency "${frequency}".`);
    return strategy;
  }

  /** Adds totals so the preview and the detail show the whole picture. */
  calculate(terms) {
    const { paymentDay, secondPaymentDay = null, installments } = this.forFrequency(terms.frequency).buildSchedule(terms);
    const sum = (field) =>
      installments.reduce((total, installment) => total + Math.round(installment[field] * 100), 0) / 100;

    return {
      paymentDay,
      secondPaymentDay,
      installments,
      totals: {
        principal: sum('principalDue'),
        interest: sum('interestDue'),
        amount: sum('amountDue'),
      },
    };
  }
}

module.exports = { LoanScheduleCalculator };
