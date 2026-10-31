const TABLE_NAME = 'expenses';

// Every expense is returned with its category name, so the frontend
// does not need a second request to show it.
const PUBLIC_COLUMNS = [
  'expenses.id',
  'expenses.categoryId',
  'expenseCategories.name as categoryName',
  'expenses.expenseDate',
  'expenses.amount',
  'expenses.description',
  'expenses.createdBy',
  'expenses.createdAt',
  'expenses.updatedAt',
];

// Soft-deleted expenses are invisible to every query in this repository.
class ExpenseRepository {
  constructor({ db }) {
    this.db = db;
  }

  activeExpenses() {
    return this.db(TABLE_NAME).whereNull('expenses.deletedAt');
  }

  withCategory(query) {
    return query.join('expenseCategories', 'expenseCategories.id', 'expenses.categoryId');
  }

  /**
   * Paginated list, newest first. Filters: date range (inclusive), category
   * and text in the description. Returns { items, total, totalAmount } where
   * totalAmount is the sum of ALL filtered expenses, not only this page.
   */
  async findAll({ from, to, categoryId, search, page, pageSize }) {
    const query = this.activeExpenses();
    if (from) query.where('expenses.expenseDate', '>=', from);
    if (to) query.where('expenses.expenseDate', '<=', to);
    if (categoryId) query.where('expenses.categoryId', categoryId);
    if (search) {
      // Escape LIKE wildcards so "%" or "_" typed by the user match literally.
      const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      query.whereRaw('unaccent(??) ILIKE unaccent(?)', ['expenses.description', pattern]);
    }

    const [{ total, totalAmount }] = await query
      .clone()
      .count({ total: '*' })
      .select(this.db.raw('COALESCE(SUM(??), 0) AS ??', ['expenses.amount', 'totalAmount']));

    const items = await this.withCategory(query)
      .select(PUBLIC_COLUMNS)
      .orderBy([
        { column: 'expenses.expenseDate', order: 'desc' },
        { column: 'expenses.id', order: 'desc' },
      ])
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { items, total: Number(total), totalAmount: Number(totalAmount) };
  }

  findById(id) {
    return this.withCategory(this.activeExpenses())
      .where('expenses.id', id)
      .first(PUBLIC_COLUMNS);
  }

  async create(data) {
    const [{ id }] = await this.db(TABLE_NAME).insert(data).returning('id');
    return this.findById(id);
  }

  async update(id, data) {
    await this.activeExpenses().where({ id }).update(data);
    return this.findById(id);
  }

  /** Returns true when an expense was deleted, false when it did not exist. */
  async softDelete(id) {
    const deletedRows = await this.activeExpenses()
      .where({ id })
      .update({ deletedAt: this.db.fn.now() });
    return deletedRows > 0;
  }
}

module.exports = { ExpenseRepository };
