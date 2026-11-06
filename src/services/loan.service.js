const { NotFoundError, ConflictError, ValidationError } = require('../errors/app-error');
const { OPEN_STATUSES: OPEN_INSTALLMENT_STATUSES } = require('../repositories/loan-installment.repository');
const { daysBetween } = require('../utils/calendar-dates');
const { toCents, fromCents } = require('../utils/money');

const fieldError = (field, message) =>
  new ValidationError(message, [{ location: 'body', field, message }]);

// Sums money fields in cents to avoid floating point drift.
const sumOf = (rows, pick) => fromCents(rows.reduce((total, row) => total + toCents(pick(row)), 0));

/**
 * Loans and their installment schedule. The schedule math lives in the
 * strategies behind LoanScheduleCalculator; this service only orchestrates.
 */
class LoanService {
  constructor({
    loanRepository,
    loanInstallmentRepository,
    paymentRepository,
    clientRepository,
    interestRateService,
    scheduleCalculator,
    scheduleKeeper,
    transactionManager,
    clock,
  }) {
    this.loanRepository = loanRepository;
    this.loanInstallmentRepository = loanInstallmentRepository;
    this.paymentRepository = paymentRepository;
    this.clientRepository = clientRepository;
    this.interestRateService = interestRateService;
    this.scheduleCalculator = scheduleCalculator;
    this.scheduleKeeper = scheduleKeeper;
    this.transactionManager = transactionManager;
    this.clock = clock;
  }

  /** Projection without saving anything (the "preview" button of the form). */
  async preview(terms) {
    await this.ensureRateIsOffered(terms);
    return this.scheduleCalculator.calculate(this.withStartDate(terms));
  }

  async create(input, { userId = null } = {}) {
    const terms = this.withStartDate(input);
    await this.ensureRateIsOffered(terms);
    await this.ensureClientExists(terms.clientId, 'clientId', 'El cliente no existe.');
    await this.ensureClientExists(terms.coDebtorId, 'coDebtorId', 'El codeudor no existe.');

    const { paymentDay, installments } = this.scheduleCalculator.calculate(terms);

    const loanId = await this.transactionManager.run(async (trx) => {
      const id = await this.loanRepository.create(
        {
          clientId: terms.clientId,
          coDebtorId: terms.coDebtorId,
          frequency: terms.frequency,
          principalAmount: terms.principalAmount,
          monthlyInterestRate: terms.monthlyInterestRate ?? null,
          installmentAmount: terms.installmentAmount ?? null,
          numberOfInstallments: terms.numberOfInstallments ?? null,
          startDate: terms.startDate,
          paymentDay,
          principalBalance: terms.principalAmount,
          notes: terms.notes ?? null,
          createdBy: userId,
        },
        { trx },
      );
      await this.loanInstallmentRepository.createMany(id, installments, { trx });
      // A past start date may already owe several months (open-ended loans).
      await this.scheduleKeeper.keepCurrent(await this.loanRepository.findById(id, { trx }), { trx });
      return id;
    });

    return this.getById(loanId);
  }

  async list(query) {
    const { items, total } = await this.loanRepository.findAll(query);
    const { page, pageSize } = query;
    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  /** Loan with its installments (marked overdue against today) and a summary. */
  async getById(id) {
    await this.scheduleKeeper.keepLoanCurrent(id);
    const loan = await this.loanRepository.findById(id);
    if (!loan) throw new NotFoundError('El crédito no existe.');

    const today = this.clock.today();
    const installments = (await this.loanInstallmentRepository.findByLoanId(id)).map(
      (installment) => this.describeInstallment(installment, today),
    );
    return { ...loan, installments, summary: this.summarize(installments) };
  }

  async listByClient(clientId) {
    const client = await this.clientRepository.findById(clientId);
    if (!client) throw new NotFoundError('El cliente no existe.');
    return this.loanRepository.findByClient(clientId);
  }

  /** Only loans without payments can be cancelled (a mistake when registering). */
  async cancel(id) {
    await this.transactionManager.run(async (trx) => {
      const loan = await this.loanRepository.findById(id, { trx, forUpdate: true });
      if (!loan) throw new NotFoundError('El crédito no existe.');
      if (loan.status !== 'active') {
        throw new ConflictError(`Solo se puede cancelar un crédito activo (este está "${loan.status}").`);
      }
      const payments = await this.paymentRepository.countActiveByLoanId(id, { trx });
      if (payments > 0) {
        throw new ConflictError(
          `No se puede cancelar: el crédito tiene ${payments} pago(s). Anule los pagos primero.`,
        );
      }
      await this.loanRepository.update(id, { status: 'cancelled' }, { trx });
      await this.loanInstallmentRepository.cancelOpenByLoanId(id, { trx });
    });
    return this.getById(id);
  }

  withStartDate(terms) {
    const today = this.clock.today();
    const startDate = terms.startDate ?? today;
    // Past dates are allowed: existing loans from the notebook get registered too.
    if (startDate > today) {
      throw fieldError('startDate', 'La fecha de desembolso no puede ser futura.');
    }
    return { ...terms, startDate };
  }

  /** Monthly loans must use a rate of the catalog; biweekly loans have no rate. */
  async ensureRateIsOffered(terms) {
    if (terms.frequency === 'monthly') await this.interestRateService.ensureOffered(terms.monthlyInterestRate);
  }

  async ensureClientExists(clientId, field, message) {
    const client = await this.clientRepository.findById(clientId);
    if (!client) throw fieldError(field, message);
  }

  describeInstallment(installment, today) {
    const paidCents = toCents(installment.principalPaid) + toCents(installment.interestPaid);
    const paid = fromCents(paidCents);
    const remaining = fromCents(toCents(installment.amountDue) - paidCents);
    const isOpen = OPEN_INSTALLMENT_STATUSES.includes(installment.status);
    const daysOverdue = isOpen ? Math.max(0, daysBetween(installment.dueDate, today)) : 0;
    return {
      ...installment,
      amountPaid: paid,
      amountRemaining: isOpen ? remaining : 0,
      isOverdue: daysOverdue > 0,
      daysOverdue,
    };
  }

  summarize(installments) {
    const open = installments.filter(({ status }) => OPEN_INSTALLMENT_STATUSES.includes(status));
    const overdue = open.filter(({ isOverdue }) => isOverdue);
    return {
      totalDue: sumOf(installments.filter(({ status }) => status !== 'cancelled'), (row) => row.amountDue),
      totalPaid: sumOf(installments, (row) => row.amountPaid),
      totalRemaining: sumOf(open, (row) => row.amountRemaining),
      overdueInstallments: overdue.length,
      overdueAmount: sumOf(overdue, (row) => row.amountRemaining),
      nextDueDate: open[0]?.dueDate ?? null,
    };
  }
}

module.exports = { LoanService };
