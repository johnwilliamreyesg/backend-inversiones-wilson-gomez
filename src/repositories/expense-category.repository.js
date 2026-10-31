const TABLE_NAME = 'expense_categories';

const PUBLIC_COLUMNS = ['id', 'name', 'isActive', 'createdAt', 'updatedAt'];

class ExpenseCategoryRepository {
  constructor({ db }) {
    this.db = db;
  }

  /** Small catalog: no pagination. Active only unless includeInactive. */
  findAll({ includeInactive = false } = {}) {
    const query = this.db(TABLE_NAME).select(PUBLIC_COLUMNS).orderBy([{ column: 'name' }]);
    if (!includeInactive) query.where({ isActive: true });
    return query;
  }

  findById(id) {
    return this.db(TABLE_NAME).where({ id }).first(PUBLIC_COLUMNS);
  }

  /** Case-insensitive, like the unique index on LOWER(name). */
  findByName(name, { excludeId } = {}) {
    const query = this.db(TABLE_NAME).whereRaw('LOWER(??) = LOWER(?)', ['name', name]);
    if (excludeId) query.whereNot({ id: excludeId });
    return query.first(PUBLIC_COLUMNS);
  }

  async create(data) {
    const [category] = await this.db(TABLE_NAME).insert(data).returning(PUBLIC_COLUMNS);
    return category;
  }

  async update(id, data) {
    const [category] = await this.db(TABLE_NAME)
      .where({ id })
      .update(data)
      .returning(PUBLIC_COLUMNS);
    return category;
  }
}

module.exports = { ExpenseCategoryRepository };
