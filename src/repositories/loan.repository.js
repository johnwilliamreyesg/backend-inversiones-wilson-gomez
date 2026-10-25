const TABLE_NAME = 'loans';

// Statuses that still involve the client and co-debtor in an open obligation.
const OPEN_STATUSES = ['active', 'defaulted'];

// Grows with the loans module (milestone 2). For now it only answers what
// the clients module needs.
class LoanRepository {
  constructor({ db }) {
    this.db = db;
  }

  /** Counts open loans where the client is the debtor or the co-debtor. */
  async countOpenByClientId(clientId) {
    const [{ total }] = await this.db(TABLE_NAME)
      .whereIn('status', OPEN_STATUSES)
      .andWhere((builder) => builder.where({ clientId }).orWhere({ coDebtorId: clientId }))
      .count({ total: '*' });
    return Number(total);
  }
}

module.exports = { LoanRepository };
