const TABLE_NAME = 'payment_schedule_changes';

const PUBLIC_COLUMNS = [
  'id',
  'paymentId',
  'installmentId',
  'previousPrincipalDue',
  'previousInterestDue',
  'previousAmountDue',
  'previousStatus',
];

// How each installment was before a principal prepayment recalculated it.
class PaymentScheduleChangeRepository {
  constructor({ db }) {
    this.db = db;
  }

  async createMany(rows, { trx } = {}) {
    if (rows.length === 0) return;
    await (trx ?? this.db)(TABLE_NAME).insert(rows);
  }

  findByPaymentId(paymentId, { trx } = {}) {
    return (trx ?? this.db)(TABLE_NAME).where({ paymentId }).select(PUBLIC_COLUMNS).orderBy('installmentId');
  }
}

module.exports = { PaymentScheduleChangeRepository };
