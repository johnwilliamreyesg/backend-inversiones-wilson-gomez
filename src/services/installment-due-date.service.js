const { NotFoundError, ConflictError, ValidationError } = require('../errors/app-error');
const { loanStatusText } = require('../utils/loan-status-labels');
const { OPEN_STATUSES: OPEN_INSTALLMENT_STATUSES } = require('../repositories/loan-installment.repository');
const { parse, dateInMonth, addMonths, addDays } = require('../utils/calendar-dates');
const { nextDateOnDays } = require('./loan-schedules/biweekly-schedule-strategy');

const PAYABLE_LOAN_STATUSES = ['active', 'defaulted'];
const BIWEEKLY_GAP_DAYS = 15;

const fieldError = (field, message) => new ValidationError(message, [{ location: 'body', field, message }]);

/**
 * Moving due dates by hand ("reagendar"). Every move is recorded in
 * installment_due_date_changes with the previous date, who did it and why.
 *
 * - One installment: only that one moves (e.g. the client agreed to pay later).
 * - That one and the following: the rest keep their rhythm from the new date.
 *   Monthly loans also take the new day as their payment day, so installments
 *   generated later (open-ended loans) fall on it too.
 * - What is left of an installment after an interest-only payment
 *   (rescheduleForPayment), undone if that payment is voided.
 */
class InstallmentDueDateService {
  constructor({ loanRepository, loanInstallmentRepository, dueDateChangeRepository, loanService, transactionManager }) {
    this.loanRepository = loanRepository;
    this.loanInstallmentRepository = loanInstallmentRepository;
    this.dueDateChangeRepository = dueDateChangeRepository;
    this.loanService = loanService;
    this.transactionManager = transactionManager;
  }

  async reschedule(loanId, installmentId, { dueDate, applyToFollowing = false, reason }, { userId = null } = {}) {
    await this.transactionManager.run(async (trx) => {
      const loan = await this.loanRepository.findById(loanId, { trx, forUpdate: true });
      if (!loan) throw new NotFoundError('El crédito no existe.');
      if (!PAYABLE_LOAN_STATUSES.includes(loan.status)) {
        throw new ConflictError(`No se pueden cambiar fechas: el crédito está ${loanStatusText(loan.status)}.`);
      }
      if (dueDate < loan.startDate) throw fieldError('dueDate', 'La fecha no puede ser anterior al desembolso.');

      const installments = await this.loanInstallmentRepository.findByLoanId(loanId, { trx, forUpdate: true });
      const target = installments.find(({ id }) => id === installmentId);
      if (!target) throw new NotFoundError('La cuota no existe en este crédito.');
      if (!OPEN_INSTALLMENT_STATUSES.includes(target.status)) {
        throw new ConflictError('Solo se puede cambiar la fecha de una cuota pendiente.');
      }

      const following = applyToFollowing
        ? installments.filter(
            (installment) =>
              installment.installmentNumber > target.installmentNumber && OPEN_INSTALLMENT_STATUSES.includes(installment.status),
          )
        : [];
      const moves = [target, ...following].map((installment, index) => ({
        installment,
        newDueDate: index === 0 ? dueDate : this.followingDate(loan, dueDate, index),
      }));

      await this.move(moves, { loanId, reason: reason ?? null, userId, trx });
      if (applyToFollowing && loan.frequency === 'monthly') {
        await this.loanRepository.update(loanId, { paymentDay: parse(dueDate).day }, { trx });
      }
    });
    return this.loanService.getById(loanId);
  }

  /**
   * Interest-only payment: what is left of the installments it touched moves
   * to `dueDate`. Runs inside the payment's transaction.
   */
  async rescheduleForPayment({ loanId, installments, dueDate, paymentId, userId, trx }) {
    const moves = installments.map((installment) => ({ installment, newDueDate: dueDate }));
    await this.move(moves, { loanId, paymentId, reason: 'Abono a intereses: se reagenda lo que queda de la cuota', userId, trx });
  }

  /** Voiding a payment puts back the dates it moved (if nobody moved them again since). */
  async undoForPayment({ paymentId, userId, trx }) {
    const changes = await this.dueDateChangeRepository.findByPaymentId(paymentId, { trx });
    if (changes.length === 0) return;
    const installments = await this.loanInstallmentRepository.findByLoanId(changes[0].loanId, { trx });
    const byId = new Map(installments.map((installment) => [installment.id, installment]));
    const moves = changes
      .filter((change) => byId.get(change.installmentId)?.dueDate === change.newDueDate)
      .map((change) => ({ installment: byId.get(change.installmentId), newDueDate: change.previousDueDate }));
    await this.move(moves, { loanId: changes[0].loanId, reason: `Se anuló el pago #${paymentId}`, userId, trx });
  }

  history(loanId) {
    return this.dueDateChangeRepository.findByLoanId(loanId);
  }

  changesForPayment(paymentId) {
    return this.dueDateChangeRepository.findByPaymentId(paymentId);
  }

  /** Date of the n-th installment after the moved one, keeping the loan's rhythm. */
  followingDate(loan, firstDate, offset) {
    if (loan.frequency === 'biweekly' && loan.secondPaymentDay) {
      // Biweekly with collection days: the next ones fall on those days.
      let date = firstDate;
      for (let step = 0; step < offset; step += 1) date = nextDateOnDays(date, [loan.paymentDay, loan.secondPaymentDay]);
      return date;
    }
    if (loan.frequency === 'biweekly') return addDays(firstDate, BIWEEKLY_GAP_DAYS * offset);
    const { year, month, day } = parse(firstDate);
    const target = addMonths(year, month, offset);
    return dateInMonth(target.year, target.month, day);
  }

  async move(moves, { loanId, paymentId = null, reason, userId, trx }) {
    // History rows first, while each installment still has its previous date.
    const rows = moves
      .filter(({ installment, newDueDate }) => installment.dueDate !== newDueDate)
      .map(({ installment, newDueDate }) => ({
        loanId,
        installmentId: installment.id,
        paymentId,
        previousDueDate: installment.dueDate,
        newDueDate,
        reason,
        changedBy: userId,
      }));
    for (const { installmentId, newDueDate } of rows) {
      await this.loanInstallmentRepository.update(installmentId, { dueDate: newDueDate }, { trx });
    }
    await this.dueDateChangeRepository.createMany(rows, { trx });
    // Keep the caller's objects in step with the database.
    const byId = new Map(moves.map(({ installment }) => [installment.id, installment]));
    for (const { installmentId, newDueDate } of rows) byId.get(installmentId).dueDate = newDueDate;
  }
}

module.exports = { InstallmentDueDateService };
