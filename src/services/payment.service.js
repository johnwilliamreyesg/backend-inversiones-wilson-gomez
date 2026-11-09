const { NotFoundError, ConflictError, ValidationError } = require('../errors/app-error');
const { loanStatusText } = require('../utils/loan-status-labels');
const { OPEN_STATUSES: OPEN_INSTALLMENT_STATUSES } = require('../repositories/loan-installment.repository');
const { LoanScheduleKeeper } = require('./loan-schedules/loan-schedule-keeper');
const { installmentStatusFor } = require('./payments/installment-status');
const { PAYMENT_TYPES, isUntouchedFuture } = require('./payments/payment-types');
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
    paymentScheduleChangeRepository,
    paymentAllocator,
    installmentRescheduler,
    dueDateService,
    scheduleKeeper,
    transactionManager,
    clock,
  }) {
    this.loanRepository = loanRepository;
    this.loanInstallmentRepository = loanInstallmentRepository;
    this.paymentRepository = paymentRepository;
    this.paymentAllocationRepository = paymentAllocationRepository;
    this.paymentScheduleChangeRepository = paymentScheduleChangeRepository;
    this.paymentAllocator = paymentAllocator;
    this.installmentRescheduler = installmentRescheduler;
    this.dueDateService = dueDateService;
    this.scheduleKeeper = scheduleKeeper;
    this.transactionManager = transactionManager;
    this.clock = clock;
  }

  async register(
    loanId,
    { amount, paymentDate: requestedDate, paymentMethod, paymentType = PAYMENT_TYPES.INSTALLMENT, recalculation, rescheduleTo, notes },
    { userId = null } = {},
  ) {
    const today = this.clock.today();
    const paymentDate = requestedDate ?? today;
    if (paymentDate > today) throw fieldError('paymentDate', 'La fecha del pago no puede ser futura.');
    if (rescheduleTo && rescheduleTo <= paymentDate) {
      throw fieldError('rescheduleTo', 'La nueva fecha debe ser posterior a la fecha del pago.');
    }

    const paymentId = await this.transactionManager.run(async (trx) => {
      const loan = await this.loanRepository.findById(loanId, { trx, forUpdate: true });
      if (!loan) throw new NotFoundError('El crédito no existe.');
      if (!PAYABLE_LOAN_STATUSES.includes(loan.status)) {
        throw new ConflictError(`El crédito no recibe pagos: está ${loanStatusText(loan.status)}.`);
      }
      if (paymentDate < loan.startDate) {
        throw fieldError('paymentDate', 'La fecha del pago es anterior al desembolso del crédito.');
      }

      await this.scheduleKeeper.keepCurrent(loan, { trx });
      const installments = await this.loanInstallmentRepository.findByLoanId(loanId, { trx, forUpdate: true });
      const isOpenEnded = LoanScheduleKeeper.isOpenEnded(loan);
      const openInstallments = installments.filter(({ status }) => OPEN_INSTALLMENT_STATUSES.includes(status));

      const { allocations, extraPrincipalCents } = this.paymentAllocator.allocate({
        amount,
        installments: openInstallments,
        isOpenEnded,
        paymentDate,
        principalBalance: loan.principalBalance,
        paymentType,
      });

      // A prepayment beyond what is due changes the installments still to come
      // of a fixed-term loan (open-ended ones just reprice their interest).
      const reschedules = !isOpenEnded && extraPrincipalCents > 0;
      if (reschedules && !recalculation) {
        throw fieldError('recalculation', 'Elija si el abono baja el valor de las cuotas o acorta el plazo.');
      }
      const futureInstallments = openInstallments.filter((installment) => isUntouchedFuture(installment, paymentDate));

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
          paymentType,
          recalculation: reschedules ? recalculation : null,
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

      // Interest only: what is left of the installments it touched gets a new date.
      if (rescheduleTo) {
        const stillOwed = allocations
          .map(({ installmentId }) => byId.get(installmentId))
          .filter(({ status }) => OPEN_INSTALLMENT_STATUSES.includes(status));
        if (stillOwed.length === 0) {
          throw fieldError('rescheduleTo', 'La cuota quedó pagada completa: no hay nada que reagendar.');
        }
        await this.dueDateService.rescheduleForPayment({
          loanId,
          installments: stillOwed,
          dueDate: rescheduleTo,
          paymentId: id,
          userId,
          trx,
        });
      }

      if (reschedules) {
        await this.rescheduleFutureInstallments(loan, futureInstallments, {
          paymentId: id,
          prepaymentCents: extraPrincipalCents,
          recalculation,
          trx,
        });
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
      // Dates moved by this payment (interest only + reschedule) go back first.
      await this.dueDateService.undoForPayment({ paymentId, userId, trx });

      const installments = await this.loanInstallmentRepository.findByLoanId(loan.id, { trx, forUpdate: true });
      const byId = new Map(installments.map((installment) => [installment.id, installment]));
      const allocations = await this.paymentAllocationRepository.findByPaymentIds([paymentId], { trx });
      const scheduleChanges = await this.paymentScheduleChangeRepository.findByPaymentId(paymentId, { trx });

      // A later payment was allocated against the recalculated installments:
      // putting the old ones back underneath it would not add up.
      if (
        scheduleChanges.length > 0 &&
        (await this.paymentRepository.hasActivePaymentsAfter(loan.id, paymentId, { trx }))
      ) {
        throw new ConflictError(
          'Este abono a capital recalculó las cuotas. Anule primero los pagos registrados después de él.',
        );
      }
      for (const change of scheduleChanges) {
        await this.loanInstallmentRepository.update(
          change.installmentId,
          {
            principalDue: change.previousPrincipalDue,
            interestDue: change.previousInterestDue,
            amountDue: change.previousAmountDue,
            status: change.previousStatus,
          },
          { trx },
        );
      }

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
    const dateChanges = await this.dueDateService.changesForPayment(id);
    return {
      ...payment,
      allocations: allocations.map(({ paymentId, ...rest }) => rest),
      // Installments whose remainder this payment moved to a new date.
      rescheduled: dateChanges.map(({ installmentNumber, previousDueDate, newDueDate }) => ({
        installmentNumber,
        previousDueDate,
        newDueDate,
      })),
    };
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

  /**
   * Principal prepayment on a fixed-term loan: recalculates the installments
   * still to come and records how they were, so voiding can restore them.
   */
  async rescheduleFutureInstallments(loan, installments, { paymentId, prepaymentCents, recalculation, trx }) {
    const rescheduled = this.installmentRescheduler.reschedule({ loan, installments, prepaymentCents, recalculation });

    await this.paymentScheduleChangeRepository.createMany(
      installments.map((installment) => ({
        paymentId,
        installmentId: installment.id,
        previousPrincipalDue: installment.principalDue,
        previousInterestDue: installment.interestDue,
        previousAmountDue: installment.amountDue,
        previousStatus: installment.status,
      })),
      { trx },
    );
    for (const { id, ...changes } of rescheduled) {
      await this.loanInstallmentRepository.update(id, changes, { trx });
    }
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
