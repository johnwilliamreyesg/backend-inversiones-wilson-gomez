const TABLE_NAME = 'installment_due_date_changes';

const PUBLIC_COLUMNS = [
  'change.id',
  'change.loanId',
  'change.installmentId',
  'installment.installmentNumber',
  'change.paymentId',
  'change.previousDueDate',
  'change.newDueDate',
  'change.reason',
  'change.changedBy',
  'user.fullName as changedByName',
  'change.createdAt',
];

class InstallmentDueDateChangeRepository {
  constructor({ db }) {
    this.db = db;
  }

  withDetails(trx) {
    return (trx ?? this.db)(`${TABLE_NAME} as change`)
      .join('loan_installments as installment', 'installment.id', 'change.installmentId')
      .leftJoin('users as user', 'user.id', 'change.changedBy');
  }

  async createMany(rows, { trx } = {}) {
    if (rows.length === 0) return;
    await (trx ?? this.db)(TABLE_NAME).insert(rows);
  }

  /** History of a loan, newest first. */
  findByLoanId(loanId, { trx } = {}) {
    return this.withDetails(trx)
      .where('change.loanId', loanId)
      .select(PUBLIC_COLUMNS)
      .orderBy([
        { column: 'change.createdAt', order: 'desc' },
        { column: 'change.id', order: 'desc' },
      ]);
  }

  findByPaymentId(paymentId, { trx } = {}) {
    return this.withDetails(trx).where('change.paymentId', paymentId).select(PUBLIC_COLUMNS).orderBy('change.id');
  }
}

module.exports = { InstallmentDueDateChangeRepository };
