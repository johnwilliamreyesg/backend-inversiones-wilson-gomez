const TABLE_NAME = 'interest_rates';

const PUBLIC_COLUMNS = ['id', 'rate', 'isActive', 'createdAt', 'updatedAt'];

class InterestRateRepository {
  constructor({ db }) {
    this.db = db;
  }

  /** Small catalog: no pagination, lowest rate first. Active only unless includeInactive. */
  findAll({ includeInactive = false } = {}) {
    const query = this.db(TABLE_NAME).select(PUBLIC_COLUMNS).orderBy('rate');
    if (!includeInactive) query.where({ isActive: true });
    return query;
  }

  findById(id) {
    return this.db(TABLE_NAME).where({ id }).first(PUBLIC_COLUMNS);
  }

  findByRate(rate, { excludeId } = {}) {
    const query = this.db(TABLE_NAME).where({ rate });
    if (excludeId) query.whereNot({ id: excludeId });
    return query.first(PUBLIC_COLUMNS);
  }

  async create(data) {
    const [interestRate] = await this.db(TABLE_NAME).insert(data).returning(PUBLIC_COLUMNS);
    return interestRate;
  }

  async update(id, data) {
    const [interestRate] = await this.db(TABLE_NAME).where({ id }).update(data).returning(PUBLIC_COLUMNS);
    return interestRate;
  }
}

module.exports = { InterestRateRepository };
