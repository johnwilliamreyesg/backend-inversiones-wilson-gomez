const { NotFoundError, ValidationError } = require('../errors/app-error');

// Business rules for expenses. Category rules are delegated to
// ExpenseCategoryService (single place that knows what a usable category is).
class ExpenseService {
  constructor({ expenseRepository, expenseCategoryService, clock }) {
    this.expenseRepository = expenseRepository;
    this.expenseCategoryService = expenseCategoryService;
    this.clock = clock;
  }

  async list({ from, to, categoryId, search, page, pageSize }) {
    const { items, total, totalAmount } = await this.expenseRepository.findAll({
      from,
      to,
      categoryId,
      search,
      page,
      pageSize,
    });
    return {
      items,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize), totalAmount },
    };
  }

  async getById(id) {
    const expense = await this.expenseRepository.findById(id);
    if (!expense) throw new NotFoundError('El gasto no existe.');
    return expense;
  }

  async create(data, { userId = null } = {}) {
    const expenseDate = data.expenseDate ?? this.clock.today();
    this.ensureDateIsNotInFuture(expenseDate);
    await this.expenseCategoryService.getActiveById(data.categoryId);

    return this.expenseRepository.create({ ...data, expenseDate, createdBy: userId });
  }

  async update(id, data) {
    const current = await this.getById(id);
    if (data.expenseDate) this.ensureDateIsNotInFuture(data.expenseDate);
    // Keeping an expense in a category that was later deactivated is fine;
    // moving it INTO an inactive one is not.
    if (data.categoryId && data.categoryId !== current.categoryId) {
      await this.expenseCategoryService.getActiveById(data.categoryId);
    }
    return this.expenseRepository.update(id, data);
  }

  async delete(id) {
    await this.getById(id);
    await this.expenseRepository.softDelete(id);
  }

  ensureDateIsNotInFuture(expenseDate) {
    // 'YYYY-MM-DD' strings compare correctly as text.
    if (expenseDate > this.clock.today()) {
      throw new ValidationError(undefined, [
        { location: 'body', field: 'expenseDate', message: 'La fecha del gasto no puede ser futura.' },
      ]);
    }
  }
}

module.exports = { ExpenseService };
