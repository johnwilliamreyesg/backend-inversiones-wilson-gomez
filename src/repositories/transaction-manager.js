/**
 * Lets a service run several repository calls as one all-or-nothing unit
 * without knowing anything about Knex:
 *
 *   await this.transactionManager.run(async (trx) => {
 *     const loan = await this.loanRepository.create(data, { trx });
 *     await this.loanInstallmentRepository.createMany(rows, { trx });
 *   });
 *
 * Repository methods accept an optional { trx } and fall back to the plain
 * connection when it is not given.
 */
class TransactionManager {
  constructor({ db }) {
    this.db = db;
  }

  run(work) {
    return this.db.transaction(work);
  }
}

module.exports = { TransactionManager };
