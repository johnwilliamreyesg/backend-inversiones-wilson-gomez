const { toCents, fromCents, roundCents } = require('../../utils/money');
const { parse, dateInMonth, addMonths } = require('../../utils/calendar-dates');

/**
 * Monthly loans: interest = monthly rate x outstanding principal.
 *
 * - With a term (numberOfInstallments): equal principal parts plus interest on
 *   the balance, so each installment is a bit smaller than the previous one.
 * - Without a term (open-ended): each month only the interest is due and the
 *   client pays principal whenever they want. Only the next installment exists;
 *   the payments module creates the following one (nextOpenEndedInstallment).
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
    let balance = principalCents;
    const installments = [];
    for (let number = 1; number <= numberOfInstallments; number += 1) {
      // The last installment takes the rounding remainder so principal adds up exactly.
      const principal = number === numberOfInstallments ? balance : regularPrincipal;
      installments.push(
        this.installment(number, dueDate(number), principal, this.interestCents(balance, monthlyInterestRate)),
      );
      balance -= principal;
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
