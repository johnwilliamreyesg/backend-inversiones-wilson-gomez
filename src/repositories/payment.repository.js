const TABLE_NAME = 'payments';

// Every payment comes with who received it, who voided it and whose loan it is.
const PUBLIC_COLUMNS = [
  'payments.id',
  'payments.loanId',
  'client.id as clientId',
  'client.fullName as clientName',
  'payments.paymentDate',
  'payments.amount',
  'payments.principalAmount',
  'payments.interestAmount',
  'payments.paymentMethod',
  'payments.paymentType',
  'payments.recalculation',
  'payments.notes',
  'payments.receivedBy',
  'receiver.fullName as receivedByName',
  'payments.voidedAt',
  'payments.voidedBy',
  'voider.fullName as voidedByName',
  'payments.voidReason',
  'payments.createdAt',
];

class PaymentRepository {
  constructor({ db }) {
    this.db = db;
  }

  withDetails(trx) {
    return (trx ?? this.db)(TABLE_NAME)
      .join('loans', 'loans.id', 'payments.loanId')
      .join('clients as client', 'client.id', 'loans.clientId')
      .leftJoin('users as receiver', 'receiver.id', 'payments.receivedBy')
      .leftJoin('users as voider', 'voider.id', 'payments.voidedBy');
  }

  /** Payments that count (not voided). */
  activePayments(trx) {
    return (trx ?? this.db)(TABLE_NAME).whereNull('payments.voidedAt');
  }

  /**
   * Paginated list, newest first, with totals of ALL filtered non-voided
   * payments (the daily cash count). Voided ones are listed only on request.
   */
  async findAll({ from, to, loanId, receivedBy, paymentMethod, includeVoided, page, pageSize }) {
    const query = this.withDetails();
    if (from) query.where('payments.paymentDate', '>=', from);
    if (to) query.where('payments.paymentDate', '<=', to);
    if (loanId) query.where('payments.loanId', loanId);
    if (receivedBy) query.where('payments.receivedBy', receivedBy);
    if (paymentMethod) query.where('payments.paymentMethod', paymentMethod);

    const [totals] = await query
      .clone()
      .whereNull('payments.voidedAt')
      .select(
        this.db.raw('COUNT(*)::int AS ??', ['count']),
        this.db.raw('COALESCE(SUM(??), 0) AS ??', ['payments.amount', 'amount']),
        this.db.raw('COALESCE(SUM(??), 0) AS ??', ['payments.principalAmount', 'principal']),
        this.db.raw('COALESCE(SUM(??), 0) AS ??', ['payments.interestAmount', 'interest']),
      );

    if (!includeVoided) query.whereNull('payments.voidedAt');
    const [{ total }] = await query.clone().count({ total: '*' });
    const items = await query
      .select(PUBLIC_COLUMNS)
      .orderBy([
        { column: 'payments.paymentDate', order: 'desc' },
        { column: 'payments.id', order: 'desc' },
      ])
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      items,
      total: Number(total),
      totals: {
        count: totals.count,
        amount: Number(totals.amount),
        principal: Number(totals.principal),
        interest: Number(totals.interest),
      },
    };
  }

  findById(id, { trx, forUpdate = false } = {}) {
    const query = this.withDetails(trx).where('payments.id', id);
    if (forUpdate) query.forUpdate('payments');
    return query.first(PUBLIC_COLUMNS);
  }

  findByLoanId(loanId) {
    return this.withDetails()
      .where('payments.loanId', loanId)
      .select(PUBLIC_COLUMNS)
      .orderBy([
        { column: 'payments.paymentDate', order: 'desc' },
        { column: 'payments.id', order: 'desc' },
      ]);
  }

  async create(data, { trx } = {}) {
    const [{ id }] = await (trx ?? this.db)(TABLE_NAME).insert(data).returning('id');
    return id;
  }

  async markVoided(id, { voidedBy, voidReason }, { trx } = {}) {
    await (trx ?? this.db)(TABLE_NAME)
      .where({ id })
      .update({ voidedAt: this.db.fn.now(), voidedBy, voidReason });
  }

  /** Whether the loan received payments (not voided) after this one was registered. */
  async hasActivePaymentsAfter(loanId, paymentId, { trx } = {}) {
    const later = await this.activePayments(trx).where({ loanId }).where('payments.id', '>', paymentId).first('payments.id');
    return Boolean(later);
  }

  async countActiveByLoanId(loanId, { trx } = {}) {
    const [{ total }] = await this.activePayments(trx).where({ loanId }).count({ total: '*' });
    return Number(total);
  }
}

module.exports = { PaymentRepository };
