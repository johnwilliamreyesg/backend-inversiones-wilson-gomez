const TABLE_NAME = 'loan_installments';

const PUBLIC_COLUMNS = [
  'id',
  'loanId',
  'installmentNumber',
  'dueDate',
  'principalDue',
  'interestDue',
  'amountDue',
  'principalPaid',
  'interestPaid',
  'status',
  'paidAt',
];

// Installments that still expect money.
const OPEN_STATUSES = ['pending', 'partially_paid'];

class LoanInstallmentRepository {
  constructor({ db }) {
    this.db = db;
  }

  findByLoanId(loanId, { trx, forUpdate = false } = {}) {
    const query = (trx ?? this.db)(TABLE_NAME)
      .where({ loanId })
      .select(PUBLIC_COLUMNS)
      .orderBy('installmentNumber');
    if (forUpdate) query.forUpdate();
    return query;
  }

  async createMany(loanId, installments, { trx } = {}) {
    if (installments.length === 0) return;
    await (trx ?? this.db)(TABLE_NAME).insert(
      installments.map((installment) => ({ loanId, ...installment })),
    );
  }

  async update(id, data, { trx } = {}) {
    await (trx ?? this.db)(TABLE_NAME).where({ id }).update(data);
  }

  /**
   * One row per open loan with installments due up to `date` (today's
   * collections): who to visit, how to reach them and how much they owe now.
   */
  findDueByLoan({ date, frequency, search }) {
    const query = this.db(`${TABLE_NAME} as installment`)
      .join('loans as loan', 'loan.id', 'installment.loanId')
      .join('clients as client', 'client.id', 'loan.clientId')
      .join('clients as coDebtor', 'coDebtor.id', 'loan.coDebtorId')
      .whereIn('loan.status', ['active', 'defaulted'])
      .whereIn('installment.status', OPEN_STATUSES)
      .where('installment.dueDate', '<=', date)
      .groupBy('loan.id', 'client.id', 'coDebtor.id')
      .select(
        'loan.id as loanId',
        'loan.frequency',
        'loan.principalBalance',
        'loan.status as loanStatus',
        'client.id as clientId',
        'client.fullName as clientName',
        'client.phoneCountryCode as clientPhoneCountryCode',
        'client.phoneNumber as clientPhoneNumber',
        'client.address as clientAddress',
        'coDebtor.fullName as coDebtorName',
        'coDebtor.phoneCountryCode as coDebtorPhoneCountryCode',
        'coDebtor.phoneNumber as coDebtorPhoneNumber',
        this.db.raw('COUNT(*)::int AS ??', ['installmentsDue']),
        this.db.raw('MIN(??) AS ??', ['installment.dueDate', 'oldestDueDate']),
        this.db.raw(
          'SUM(?? - ?? - ??) AS ??',
          ['installment.amountDue', 'installment.principalPaid', 'installment.interestPaid', 'amountDue'],
        ),
      )
      .orderBy([{ column: 'oldestDueDate' }, { column: 'client.fullName' }]);

    if (frequency) query.where('loan.frequency', frequency);
    if (search) {
      // Escape LIKE wildcards so "%" or "_" typed by the user match literally.
      const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      query.where((builder) =>
        builder
          .whereRaw('unaccent(??) ILIKE unaccent(?)', ['client.fullName', pattern])
          .orWhereILike('client.nationalId', pattern)
          .orWhereILike('client.address', pattern),
      );
    }
    return query;
  }

  /** Marks every installment that still expected money as cancelled. */
  async cancelOpenByLoanId(loanId, { trx } = {}) {
    await (trx ?? this.db)(TABLE_NAME)
      .where({ loanId })
      .whereIn('status', OPEN_STATUSES)
      .update({ status: 'cancelled' });
  }
}

module.exports = { LoanInstallmentRepository, OPEN_STATUSES };
