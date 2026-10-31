const { NotFoundError, ConflictError, ValidationError } = require('../errors/app-error');
const { OPEN_STATUSES: OPEN_INSTALLMENT_STATUSES } = require('../repositories/loan-installment.repository');
const { LoanScheduleKeeper } = require('./loan-schedules/loan-schedule-keeper');
const { installmentStatusFor } = require('./payments/installment-status');
const { toCents, fromCents } = require('../utils/money');

// Loans that can still receive money.
const PAYABLE_LOAN_STATUSES = ['active', 'defaulted'];

const fieldError = (field, message) =>
  new ValidationError(message, [{ location: 'body', field, message }]);

/**
 * Registering and voiding payments. Each operation is ONE transaction that
 * locks the loan and its installments, so two collectors registering a payment
 * for the same loan at the same moment cannot both spend the same installment.
 */
class PaymentService {
  constructor({
    loanRepository,
    loanInstallmentRepository,
    paymentRepository,
    paymentAllocationRepository,
    paymentAllocator,
    scheduleKeeper,
    transactionManager,
    clock,
  }) {
    this.loanRepository = loanRepository;
    this.loanInstallmentRepository = loanInstallmentRepository;
    this.paymentRepository = paymentRepository;
    this.paymentAllocationRepository = paymentAllocationRepository;
    this.paymentAllocator = paymentAllocator;
    this.scheduleKeeper = scheduleKeeper;
    this.transactionManager = transactionManager;
    this.clock = clock;
  }

  async register(loanId, { amount, paymentDate: requestedDate, paymentMethod, notes }, { userId = null } = {}) {
    const today = this.clock.today();
    const paymentDate = requestedDate ?? today;
    if (paymentDate > today) throw fieldError('paymentDate', 'La fecha del pago no puede ser futura.');

    const paymentId = await this.transactionManager.run(async (trx) => {
      const loan = await this.loanRepository.findById(loanId, { trx, forUpdate: true });
      if (!loan) throw new NotFoundError('El crédito no existe.');
      if (!PAYABLE_LOAN_STATUSES.includes(loan.status)) {
        throw new ConflictError(`El crédito no recibe pagos: está "${loan.status}".`);
      }
      if (paymentDate < loan.startDate) {
        throw fieldError('paymentDate', 'La fecha del pago es anterior al desembolso del crédito.');
      }

      await this.scheduleKeeper.keepCurrent(loan, { trx });
      const installments = await this.loanInstallmentRepository.findByLoanId(loanId, { trx, forUpdate: true });
      const isOpenEnded = LoanScheduleKeeper.isOpenEnded(loan);

      const { allocations, extraPrincipalCents } = this.paymentAllocator.allocate({
        amount,
        installments: installments.filter(({ status }) => OPEN_INSTALLMENT_STATUSES.includes(status)),
        isOpenEnded,
        paymentDate,
        principalBalance: loan.principalBalance,
      });

      const interestCents = allocations.reduce((total, a) => total + a.interestCents, 0);
      const principalCents =
        allocations.reduce((total, a) => total + a.principalCents, 0) + extraPrincipalCents;

      const id = await this.paymentRepository.create(
        {
          loanId,
          paymentDate,
          amount,
          principalAmount: fromCents(principalCents),
          interestAmount: fromCents(interestCents),
          paymentMethod,
          notes: notes ?? null,
          receivedBy: userId,
        },
        { trx },
      );
      await this.paymentAllocationRepository.createMany(
        allocations.map((a) => ({
          paymentId: id,
          installmentId: a.installmentId,
          principalAmount: fromCents(a.principalCents),
          interestAmount: fromCents(a.interestCents),
        })),
        { trx },
      );

      const byId = new Map(installments.map((installment) => [installment.id, installment]));
      for (const a of allocations) {
        const installment = byId.get(a.installmentId);
        await this.applyToInstallment(installment, a.principalCents, a.interestCents, { trx });
      }

      const principalBalance = fromCents(toCents(loan.principalBalance) - principalCents);
      const updatedLoan = { ...loan, principalBalance };
      if (isOpenEnded && extraPrincipalCents > 0) {
        await this.scheduleKeeper.repriceFutureInstallments(updatedLoan, { trx, after: paymentDate });
      }
      const stillOpen = (await this.loanInstallmentRepository.findByLoanId(loanId, { trx })).some(
        ({ status }) => OPEN_INSTALLMENT_STATUSES.includes(status),
      );
      await this.loanRepository.update(
        loanId,
        { principalBalance, status: principalBalance === 0 && !stillOpen ? 'paid_off' : loan.status },
        { trx },
      );
      return id;
    });

    return this.getById(paymentId);
  }

  /** Undoes a payment (wrong amount, wrong loan...). The record stays, marked as voided. */
  async void(paymentId, { reason }, { userId = null } = {}) {
    await this.transactionManager.run(async (trx) => {
      const payment = await this.paymentRepository.findById(paymentId, { trx, forUpdate: true });
      if (!payment) throw new NotFoundError('El pago no existe.');
      if (payment.voidedAt) throw new ConflictError('El pago ya está anulado.');

      const loan = await this.loanRepository.findById(payment.loanId, { trx, forUpdate: true });
      const installments = await this.loanInstallmentRepository.findByLoanId(loan.id, { trx, forUpdate: true });
      const byId = new Map(installments.map((installment) => [installment.id, installment]));
      const allocations = await this.paymentAllocationRepository.findByPaymentIds([paymentId], { trx });

      for (const a of allocations) {
        await this.applyToInstallment(
          byId.get(a.installmentId),
          -toCents(a.principalAmount),
          -toCents(a.interestAmount),
          { trx },
        );
      }

      const principalBalance = fromCents(toCents(loan.principalBalance) + toCents(payment.principalAmount));
      const status = loan.status === 'paid_off' ? 'active' : loan.status;
      await this.loanRepository.update(loan.id, { principalBalance, status }, { trx });
      await this.paymentRepository.markVoided(paymentId, { voidedBy: userId, voidReason: reason }, { trx });

      const updatedLoan = { ...loan, principalBalance, status };
      await this.scheduleKeeper.repriceFutureInstallments(updatedLoan, { trx, after: payment.paymentDate });
      await this.scheduleKeeper.keepCurrent(updatedLoan, { trx });
    });

    return this.getById(paymentId);
  }

  async getById(id) {
    const payment = await this.paymentRepository.findById(id);
    if (!payment) throw new NotFoundError('El pago no existe.');
    const allocations = await this.paymentAllocationRepository.findByPaymentIds([id]);
    return { ...payment, allocations: allocations.map(({ paymentId, ...rest }) => rest) };
  }

  async listByLoan(loanId) {
    const loan = await this.loanRepository.findById(loanId);
    if (!loan) throw new NotFoundError('El crédito no existe.');
    return this.paymentRepository.findByLoanId(loanId);
  }

  async list(query) {
    const { items, total, totals } = await this.paymentRepository.findAll(query);
    const { page, pageSize } = query;
    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize), totals } };
  }

  /** Adds (or with negative cents, removes) money to an installment and updates its status. */
  async applyToInstallment(installment, principalCents, interestCents, { trx }) {
    const principalPaid = fromCents(toCents(installment.principalPaid) + principalCents);
    const interestPaid = fromCents(toCents(installment.interestPaid) + interestCents);
    const status = installmentStatusFor({ ...installment, principalPaid, interestPaid });
    const paidAt = status === 'paid' ? (installment.paidAt ?? new Date()) : null;

    Object.assign(installment, { principalPaid, interestPaid, status, paidAt });
    await this.loanInstallmentRepository.update(
      installment.id,
      { principalPaid, interestPaid, status, paidAt },
      { trx },
    );
  }
}

module.exports = { PaymentService };
