const TABLE_NAME = 'payment_allocations';

// Which part of a payment went to which installment.
class PaymentAllocationRepository {
  constructor({ db }) {
    this.db = db;
  }

  findByPaymentIds(paymentIds, { trx } = {}) {
    if (paymentIds.length === 0) return [];
    return (trx ?? this.db)(TABLE_NAME)
      .join('loanInstallments', 'loanInstallments.id', 'paymentAllocations.installmentId')
      .whereIn('paymentAllocations.paymentId', paymentIds)
      .select(
        'paymentAllocations.paymentId',
        'paymentAllocations.installmentId',
        'loanInstallments.installmentNumber',
        'loanInstallments.dueDate',
        'paymentAllocations.principalAmount',
        'paymentAllocations.interestAmount',
      )
      .orderBy('loanInstallments.installmentNumber');
  }

  async createMany(rows, { trx } = {}) {
    if (rows.length === 0) return;
    await (trx ?? this.db)(TABLE_NAME).insert(rows);
  }
}

module.exports = { PaymentAllocationRepository };
