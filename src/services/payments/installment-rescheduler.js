const { toCents, fromCents, roundCents } = require('../../utils/money');
const { RECALCULATIONS } = require('./payment-types');

/**
 * Recalculates the installments still to come of a fixed-term loan after a
 * principal prepayment ("abono a capital"). Pure calculation (no database).
 *
 * Principal: the prepayment comes off the given installments, either
 * - reduce_installment: spread evenly, same number of installments, each smaller;
 * - reduce_term: from the last installment backwards, so the last ones
 *   disappear (cancelled) and the others stay as they were.
 *
 * Interest: each frequency recalculates it its own way
 * (strategy.rescheduledInterestCents), because monthly loans have a rate and
 * biweekly loans do not.
 */
class InstallmentRescheduler {
  constructor({ scheduleCalculator, roundingUnitCents }) {
    this.scheduleCalculator = scheduleCalculator;
    this.roundingUnitCents = roundingUnitCents;
  }

  /**
   * @param installments untouched future installments, ordered by number
   * @returns [{ id, principalDue, interestDue, amountDue, status }] one per installment
   */
  reschedule({ loan, installments, prepaymentCents, recalculation }) {
    const before = installments.map(({ principalDue }) => toCents(principalDue));
    const principalsCents =
      recalculation === RECALCULATIONS.REDUCE_TERM
        ? this.cutFromTheEnd(before, prepaymentCents)
        : this.spreadEvenly(before, prepaymentCents);

    const interestsCents = this.scheduleCalculator
      .forFrequency(loan.frequency)
      .rescheduledInterestCents({ loan, installments, principalsCents });

    return installments.map(({ id }, index) => {
      const principal = principalsCents[index];
      const interest = interestsCents[index];
      return {
        id,
        principalDue: fromCents(principal),
        interestDue: fromCents(interest),
        amountDue: fromCents(principal + interest),
        status: principal + interest === 0 ? 'cancelled' : 'pending',
      };
    });
  }

  spreadEvenly(before, prepaymentCents) {
    const total = before.reduce((sum, cents) => sum + cents, 0) - prepaymentCents;
    const count = before.length;
    const regular = roundCents(total / count, this.roundingUnitCents, 'down');
    // The last installment takes the rounding remainder so principal adds up exactly.
    return before.map((_, index) => (index === count - 1 ? total - regular * (count - 1) : regular));
  }

  cutFromTheEnd(before, prepaymentCents) {
    let remaining = prepaymentCents;
    const after = [...before];
    for (let index = after.length - 1; index >= 0 && remaining > 0; index -= 1) {
      const cut = Math.min(remaining, after[index]);
      after[index] -= cut;
      remaining -= cut;
    }
    return after;
  }
}

module.exports = { InstallmentRescheduler };
