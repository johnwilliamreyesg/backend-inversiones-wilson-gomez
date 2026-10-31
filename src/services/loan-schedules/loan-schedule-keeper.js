/**
 * Open-ended monthly loans have no end date, so their installments cannot be
 * generated up front. This class keeps them current: every installment whose
 * due date has arrived exists, plus the next upcoming one.
 *
 * It must not depend on the client paying (a client who stops paying is
 * exactly the one whose debt must keep showing), so it runs when a loan is
 * created or read, when a payment is registered and before today's
 * collections list is built.
 */
class LoanScheduleKeeper {
  constructor({ loanRepository, loanInstallmentRepository, monthlyStrategy, transactionManager, clock }) {
    this.loanRepository = loanRepository;
    this.loanInstallmentRepository = loanInstallmentRepository;
    this.monthlyStrategy = monthlyStrategy;
    this.transactionManager = transactionManager;
    this.clock = clock;
  }

  static isOpenEnded(loan) {
    return loan.frequency === 'monthly' && !loan.numberOfInstallments;
  }

  /** Adds the missing installments of one loan. Call inside a transaction holding the loan lock. */
  async keepCurrent(loan, { trx }) {
    if (!LoanScheduleKeeper.isOpenEnded(loan) || loan.status !== 'active') return 0;

    const today = this.clock.today();
    const existing = await this.loanInstallmentRepository.findByLoanId(loan.id, { trx });
    let last = existing[existing.length - 1];
    const missing = [];

    // 'YYYY-MM-DD' strings compare correctly as text.
    while (last.dueDate <= today) {
      last = this.monthlyStrategy.nextOpenEndedInstallment({
        principalBalance: loan.principalBalance,
        monthlyInterestRate: loan.monthlyInterestRate,
        paymentDay: loan.paymentDay,
        previous: last,
      });
      missing.push(last);
    }

    await this.loanInstallmentRepository.createMany(loan.id, missing, { trx });
    return missing.length;
  }

  /**
   * After the balance of an open-ended loan changes (prepayment or a voided
   * one), installments due after `after` that nobody has paid yet are recomputed
   * with the new balance. With balance 0 they are cancelled (nothing more is
   * owed); a voided payoff brings them back.
   */
  async repriceFutureInstallments(loan, { trx, after }) {
    if (!LoanScheduleKeeper.isOpenEnded(loan)) return;

    const installments = await this.loanInstallmentRepository.findByLoanId(loan.id, { trx });
    const untouched = installments.filter(
      (installment) =>
        installment.dueDate > after &&
        ['pending', 'cancelled'].includes(installment.status) &&
        installment.principalPaid === 0 &&
        installment.interestPaid === 0,
    );

    for (const installment of untouched) {
      if (loan.principalBalance === 0) {
        await this.loanInstallmentRepository.update(installment.id, { status: 'cancelled' }, { trx });
        continue;
      }
      const { interestDue, amountDue } = this.monthlyStrategy.nextOpenEndedInstallment({
        principalBalance: loan.principalBalance,
        monthlyInterestRate: loan.monthlyInterestRate,
        paymentDay: loan.paymentDay,
        previous: { installmentNumber: 0, dueDate: installment.dueDate },
      });
      await this.loanInstallmentRepository.update(
        installment.id,
        { interestDue, amountDue, status: 'pending' },
        { trx },
      );
    }
  }

  /** Locks the loan and keeps it current in its own transaction. */
  keepLoanCurrent(loanId) {
    return this.transactionManager.run(async (trx) => {
      const loan = await this.loanRepository.findById(loanId, { trx, forUpdate: true });
      return loan ? this.keepCurrent(loan, { trx }) : 0;
    });
  }

  /** Every active open-ended loan (before building today's collections). */
  async keepAllCurrent() {
    const ids = await this.loanRepository.findActiveOpenEndedIds();
    let created = 0;
    for (const id of ids) created += await this.keepLoanCurrent(id);
    return created;
  }
}

module.exports = { LoanScheduleKeeper };
