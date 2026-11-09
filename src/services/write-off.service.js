const { NotFoundError, ConflictError, ValidationError } = require('../errors/app-error');
const { buildAgreementSchedule } = require('./write-offs/agreement-schedule');
const { toCents, fromCents } = require('../utils/money');

const fieldError = (field, message) => new ValidationError(message, [{ location: 'body', field, message }]);
const sumOf = (rows, pick) => fromCents(rows.reduce((total, row) => total + toCents(pick(row)), 0));

/**
 * Written-off portfolio ("cartera castigada").
 *
 * - Writing a client off: the client is archived with ALL their open loans
 *   (status 'written_off'). Those loans leave the collections list, the
 *   portfolio and the effectiveness of the month; they cannot receive payments.
 * - Payment agreement: if the client shows up and negotiates, a written-off
 *   loan gets a new schedule (agreed amount, installments, dates) and becomes
 *   active again. Principal the agreement does not cover is forgiven and
 *   recorded. When no written-off loan is left, the client stops being written off.
 */
class WriteOffService {
  constructor({
    clientRepository,
    loanRepository,
    loanInstallmentRepository,
    loanRenegotiationRepository,
    loanService,
    transactionManager,
    clock,
    roundingUnitCents,
  }) {
    this.clientRepository = clientRepository;
    this.loanRepository = loanRepository;
    this.loanInstallmentRepository = loanInstallmentRepository;
    this.loanRenegotiationRepository = loanRenegotiationRepository;
    this.loanService = loanService;
    this.transactionManager = transactionManager;
    this.clock = clock;
    this.roundingUnitCents = roundingUnitCents;
  }

  async writeOffClient(clientId, { reason }, { userId = null } = {}) {
    await this.transactionManager.run(async (trx) => {
      const client = await this.clientRepository.findByIdForUpdate(clientId, { trx });
      if (!client) throw new NotFoundError('El cliente no existe.');
      if (client.writtenOffAt) throw new ConflictError('El cliente ya está en cartera castigada.');

      const loans = await this.loanRepository.findOpenByDebtor(clientId, { trx });
      if (loans.length === 0) {
        throw new ConflictError('El cliente no tiene créditos abiertos para castigar.');
      }
      const now = new Date();
      for (const { id } of loans) {
        await this.loanRepository.update(id, { status: 'written_off', writtenOffAt: now }, { trx });
      }
      await this.clientRepository.update(clientId, { writtenOffAt: now, writtenOffBy: userId, writeOffReason: reason }, { trx });
    });
    return this.list().then(({ items }) => items.find((item) => item.client.id === clientId));
  }

  /** Written-off clients with their written-off loans and what is lost. */
  async list() {
    const clients = await this.clientRepository.findWrittenOff();
    const loans = await this.loanRepository.findWrittenOffByClients(clients.map(({ id }) => id));
    const items = clients.map((client) => {
      const own = loans
        .filter((loan) => loan.clientId === client.id)
        .map((loan) => ({ ...loan, amountOwed: Number(loan.amountOwed) }));
      return {
        client,
        loans: own,
        principalLost: sumOf(own, (loan) => loan.principalBalance),
        amountOwed: sumOf(own, (loan) => loan.amountOwed),
      };
    });
    return {
      items,
      meta: {
        clients: items.length,
        loans: loans.length,
        principalLost: sumOf(items, (item) => item.principalLost),
      },
    };
  }

  /** New payment agreement for a written-off loan; the loan becomes active again. */
  async renegotiate(loanId, { agreedAmount, numberOfInstallments, frequency, firstDueDate, notes }, { userId = null } = {}) {
    if (firstDueDate < this.clock.today()) {
      throw fieldError('firstDueDate', 'La primera cuota del acuerdo no puede ser en el pasado.');
    }
    await this.transactionManager.run(async (trx) => {
      const loan = await this.loanRepository.findById(loanId, { trx, forUpdate: true });
      if (!loan) throw new NotFoundError('El crédito no existe.');
      if (loan.status !== 'written_off') {
        throw new ConflictError('Solo se puede negociar un crédito que está en cartera castigada.');
      }

      const installments = await this.loanInstallmentRepository.findByLoanId(loanId, { trx, forUpdate: true });
      const lastNumber = installments.reduce((max, row) => Math.max(max, row.installmentNumber), 0);
      const agreement = buildAgreementSchedule({
        previousBalance: loan.principalBalance,
        agreedAmount,
        numberOfInstallments,
        frequency,
        firstDueDate,
        firstInstallmentNumber: lastNumber + 1,
        roundingUnitCents: this.roundingUnitCents,
      });

      // The old schedule stops counting; the agreement replaces it.
      await this.loanInstallmentRepository.cancelOpenByLoanId(loanId, { trx });
      await this.loanInstallmentRepository.createMany(loanId, agreement.installments, { trx });
      await this.loanRepository.update(
        loanId,
        { status: 'active', principalBalance: agreement.principalBalance, renegotiatedAt: new Date() },
        { trx },
      );
      await this.loanRenegotiationRepository.create(
        {
          loanId,
          previousBalance: loan.principalBalance,
          agreedAmount,
          forgivenPrincipal: agreement.forgivenPrincipal,
          frequency,
          numberOfInstallments,
          firstDueDate,
          notes: notes ?? null,
          createdBy: userId,
        },
        { trx },
      );

      // No written-off loan left: the client is back to normal.
      if ((await this.loanRepository.countWrittenOffByClient(loan.clientId, { trx })) === 0) {
        await this.clientRepository.update(loan.clientId, { writtenOffAt: null, writtenOffBy: null, writeOffReason: null }, { trx });
      }
    });
    return this.loanService.getById(loanId);
  }
}

module.exports = { WriteOffService };
