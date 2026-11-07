const { toCents, fromCents, roundCents } = require('../../utils/money');
const { parse, dateInMonth, addMonths } = require('../../utils/calendar-dates');

/**
 * Monthly loans.
 *
 * - With a term (numberOfInstallments): equal installments, the way the lender
 *   does it by hand: principal / installments + monthly rate x the INITIAL
 *   principal. They only change after a principal prepayment (then the rate
 *   applies to the principal left, see rescheduledInterestCents).
 * - Without a term (open-ended): each month only the interest is due, on the
 *   current balance, and the client pays principal whenever they want. Only
 *   the next installment exists; the payments module creates the following
 *   one (nextOpenEndedInstallment).
 *
 * Due dates: `paymentDay` of every month starting the month after the
 * disbursement (31 becomes 30 or 28/29 in shorter months). By default the
 * payment day is the disbursement day, i.e. exactly one month later.
 */
class MonthlyScheduleStrategy {
  constructor({ roundingUnitCents }) {
    this.roundingUnitCents = roundingUnitCents;
  }

  buildSchedule({ principalAmount, monthlyInterestRate, numberOfInstallments, startDate, paymentDay }) {
    const day = paymentDay ?? parse(startDate).day;
    const principalCents = toCents(principalAmount);
    const dueDate = (installmentNumber) => this.dueDate(startDate, day, installmentNumber);

    if (!numberOfInstallments) {
      const interestCents = this.interestCents(principalCents, monthlyInterestRate);
      return {
        paymentDay: day,
        installments: [this.installment(1, dueDate(1), 0, interestCents)],
      };
    }

    const regularPrincipal = roundCents(
      principalCents / numberOfInstallments,
      this.roundingUnitCents,
      'down',
    );
    // Flat interest: the same amount every month, on the initial principal.
    const interest = this.interestCents(principalCents, monthlyInterestRate);
    const installments = [];
    for (let number = 1; number <= numberOfInstallments; number += 1) {
      // The last installment takes the rounding remainder so principal adds up exactly.
      const principal =
        number === numberOfInstallments ? principalCents - regularPrincipal * (numberOfInstallments - 1) : regularPrincipal;
      installments.push(this.installment(number, dueDate(number), principal, interest));
    }
    return { paymentDay: day, installments };
  }

  /** Next interest-only installment of an open-ended loan, on the current balance. */
  nextOpenEndedInstallment({ principalBalance, monthlyInterestRate, paymentDay, previous }) {
    const { year, month } = parse(previous.dueDate);
    const next = addMonths(year, month, 1);
    return this.installment(
      previous.installmentNumber + 1,
      dateInMonth(next.year, next.month, paymentDay),
      0,
      this.interestCents(toCents(principalBalance), monthlyInterestRate),
    );
  }

  /**
   * Interest of installments recalculated after a principal prepayment
   * (InstallmentRescheduler): still flat, now on the principal left after the
   * prepayment, so the installments stay equal to each other. An installment
   * left without principal (shortened term) has no interest either.
   */
  rescheduledInterestCents({ loan, principalsCents }) {
    const principalLeft = principalsCents.reduce((total, cents) => total + cents, 0);
    const interest = this.interestCents(principalLeft, loan.monthlyInterestRate);
    return principalsCents.map((principal) => (principal > 0 ? interest : 0));
  }

  dueDate(startDate, paymentDay, installmentNumber) {
    const { year, month } = parse(startDate);
    const target = addMonths(year, month, installmentNumber);
    return dateInMonth(target.year, target.month, paymentDay);
  }

  interestCents(balanceCents, monthlyInterestRate) {
    return roundCents((balanceCents * monthlyInterestRate) / 100, this.roundingUnitCents);
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

module.exports = { MonthlyScheduleStrategy };
