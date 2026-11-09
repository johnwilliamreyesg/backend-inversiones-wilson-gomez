const TABLE_NAME = 'loans';

// Statuses that still involve the client and co-debtor in an open obligation.
const OPEN_STATUSES = ['active', 'defaulted'];
// A written-off loan is still owed (it just stopped being collected).
const OWED_STATUSES = [...OPEN_STATUSES, 'written_off'];

// Every loan is returned with the names of its client and co-debtor, so lists
// do not need extra requests.
const PUBLIC_COLUMNS = [
  'loans.id',
  'loans.clientId',
  'client.fullName as clientName',
  'client.nationalId as clientNationalId',
  'client.phoneCountryCode as clientPhoneCountryCode',
  'client.phoneNumber as clientPhoneNumber',
  'loans.coDebtorId',
  'coDebtor.fullName as coDebtorName',
  'loans.frequency',
  'loans.principalAmount',
  'loans.monthlyInterestRate',
  'loans.installmentAmount',
  'loans.numberOfInstallments',
  'loans.startDate',
  'loans.paymentDay',
  'loans.secondPaymentDay',
  'loans.writtenOffAt',
  'loans.renegotiatedAt',
  'loans.principalBalance',
  'loans.status',
  'loans.notes',
  'loans.createdBy',
  'loans.createdAt',
  'loans.updatedAt',
];

class LoanRepository {
  constructor({ db }) {
    this.db = db;
  }

  // Joins with clients regardless of deleted_at: a loan's history must keep
  // showing who the client was.
  withParties(trx) {
    return (trx ?? this.db)(TABLE_NAME)
      .join('clients as client', 'client.id', 'loans.clientId')
      // The co-debtor is optional.
      .leftJoin('clients as coDebtor', 'coDebtor.id', 'loans.coDebtorId');
  }

  /**
   * Paginated list, newest disbursement first. `clientId` matches the client
   * as debtor OR co-debtor; `search` matches the debtor's name or national ID.
   */
  async findAll({ status, frequency, clientId, search, page, pageSize }) {
    const query = this.withParties();
    if (status) query.where('loans.status', status);
    if (frequency) query.where('loans.frequency', frequency);
    if (clientId) {
      query.where((builder) =>
        builder.where('loans.clientId', clientId).orWhere('loans.coDebtorId', clientId),
      );
    }
    if (search) {
      // Escape LIKE wildcards so "%" or "_" typed by the user match literally.
      const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      query.where((builder) =>
        builder
          .whereRaw('unaccent(??) ILIKE unaccent(?)', ['client.fullName', pattern])
          .orWhereILike('client.nationalId', pattern),
      );
    }

    const [{ total }] = await query.clone().count({ total: '*' });
    const items = await query
      .select(PUBLIC_COLUMNS)
      .orderBy([
        { column: 'loans.startDate', order: 'desc' },
        { column: 'loans.id', order: 'desc' },
      ])
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { items, total: Number(total) };
  }

  /** `forUpdate` locks the row until the transaction ends (payments, cancellation). */
  findById(id, { trx, forUpdate = false } = {}) {
    const query = this.withParties(trx).where('loans.id', id);
    if (forUpdate) query.forUpdate('loans');
    return query.first(PUBLIC_COLUMNS);
  }

  /** Loans of a client split by role, for the client's detail screen. */
  async findByClient(clientId) {
    const loans = await this.withParties()
      .where('loans.clientId', clientId)
      .orWhere('loans.coDebtorId', clientId)
      .select([
        ...PUBLIC_COLUMNS,
        // Paid-off loans: the date of the last payment that counts (the client's history).
        this.db.raw(
          `CASE WHEN loans.status = 'paid_off'
             THEN (SELECT MAX(p.payment_date) FROM payments p WHERE p.loan_id = loans.id AND p.voided_at IS NULL)
           END AS ??`,
          ['paidOffDate'],
        ),
      ])
      .orderBy([
        { column: 'loans.startDate', order: 'desc' },
        { column: 'loans.id', order: 'desc' },
      ]);
    return {
      asDebtor: loans.filter((loan) => loan.clientId === clientId),
      asCoDebtor: loans.filter((loan) => loan.coDebtorId === clientId),
    };
  }

  async create(data, { trx } = {}) {
    const [{ id }] = await (trx ?? this.db)(TABLE_NAME).insert(data).returning('id');
    return id;
  }

  async update(id, data, { trx } = {}) {
    await (trx ?? this.db)(TABLE_NAME).where({ id }).update(data);
  }

  /** Active monthly loans without a term (their installments are generated over time). */
  async findActiveOpenEndedIds() {
    const rows = await this.db(TABLE_NAME)
      .where({ status: 'active', frequency: 'monthly' })
      .whereNull('numberOfInstallments')
      // A payment agreement replaced the open-ended schedule.
      .whereNull('renegotiatedAt')
      .select('id');
    return rows.map(({ id }) => id);
  }

  /** Open loans of a client as debtor, locked (writing the client off). */
  findOpenByDebtor(clientId, { trx }) {
    return trx(TABLE_NAME).where({ clientId }).whereIn('status', OPEN_STATUSES).forUpdate().select('id', 'principalBalance');
  }

  /** Written-off loans of these clients, with what is still owed on their installments. */
  findWrittenOffByClients(clientIds, { trx } = {}) {
    if (clientIds.length === 0) return [];
    return (trx ?? this.db)(`${TABLE_NAME} as loan`)
      .whereIn('loan.clientId', clientIds)
      .where('loan.status', 'written_off')
      .select(
        'loan.id',
        'loan.clientId',
        'loan.frequency',
        'loan.principalAmount',
        'loan.principalBalance',
        'loan.startDate',
        'loan.writtenOffAt',
        this.db.raw(
          `(SELECT COALESCE(SUM(i.amount_due - i.principal_paid - i.interest_paid), 0)
              FROM loan_installments i
             WHERE i.loan_id = loan.id AND i.status IN ('pending', 'partially_paid')) AS ??`,
          ['amountOwed'],
        ),
      )
      .orderBy('loan.id');
  }

  countWrittenOffByClient(clientId, { trx } = {}) {
    return (trx ?? this.db)(TABLE_NAME)
      .where({ clientId, status: 'written_off' })
      .count({ total: '*' })
      .then(([{ total }]) => Number(total));
  }

  /** Counts loans still owed where the client is the debtor or the co-debtor. */
  async countOpenByClientId(clientId) {
    const [{ total }] = await this.db(TABLE_NAME)
      .whereIn('status', OWED_STATUSES)
      .andWhere((builder) => builder.where({ clientId }).orWhere({ coDebtorId: clientId }))
      .count({ total: '*' });
    return Number(total);
  }
}

module.exports = { LoanRepository, OPEN_STATUSES };
