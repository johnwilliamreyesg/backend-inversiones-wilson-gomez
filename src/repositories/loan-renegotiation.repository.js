const TABLE_NAME = 'loan_renegotiations';

const PUBLIC_COLUMNS = [
  'renegotiation.id',
  'renegotiation.loanId',
  'renegotiation.previousBalance',
  'renegotiation.agreedAmount',
  'renegotiation.forgivenPrincipal',
  'renegotiation.frequency',
  'renegotiation.numberOfInstallments',
  'renegotiation.firstDueDate',
  'renegotiation.notes',
  'renegotiation.createdBy',
  'user.fullName as createdByName',
  'renegotiation.createdAt',
];

// Payment agreements made for written-off loans.
class LoanRenegotiationRepository {
  constructor({ db }) {
    this.db = db;
  }

  async create(data, { trx } = {}) {
    const [{ id }] = await (trx ?? this.db)(TABLE_NAME).insert(data).returning('id');
    return id;
  }

  /** Agreements of a loan, newest first. */
  findByLoanId(loanId, { trx } = {}) {
    return (trx ?? this.db)(`${TABLE_NAME} as renegotiation`)
      .leftJoin('users as user', 'user.id', 'renegotiation.createdBy')
      .where('renegotiation.loanId', loanId)
      .select(PUBLIC_COLUMNS)
      .orderBy([
        { column: 'renegotiation.createdAt', order: 'desc' },
        { column: 'renegotiation.id', order: 'desc' },
      ]);
  }
}

module.exports = { LoanRenegotiationRepository };
