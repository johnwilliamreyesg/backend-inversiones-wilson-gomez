const { NotFoundError, ConflictError, ValidationError } = require('../errors/app-error');

// Catalog of expense categories. They are never deleted (old expenses keep
// pointing to them); an inactive category just stops being offered for new ones.
class ExpenseCategoryService {
  constructor({ expenseCategoryRepository }) {
    this.expenseCategoryRepository = expenseCategoryRepository;
  }

  list({ includeInactive }) {
    return this.expenseCategoryRepository.findAll({ includeInactive });
  }

  async getById(id) {
    const category = await this.expenseCategoryRepository.findById(id);
    if (!category) throw new NotFoundError('La categoría no existe.');
    return category;
  }

  async create(data) {
    await this.ensureNameIsAvailable(data.name);
    return this.expenseCategoryRepository.create(data);
  }

  async update(id, data) {
    await this.getById(id);
    if (data.name) {
      await this.ensureNameIsAvailable(data.name, { excludeId: id });
    }
    return this.expenseCategoryRepository.update(id, data);
  }

  /**
   * Used by ExpenseService: new or moved expenses need an active category.
   * A bad categoryId is invalid input (400 on that field), not a missing route.
   */
  async getActiveById(id) {
    const category = await this.expenseCategoryRepository.findById(id);
    let message;
    if (!category) message = 'La categoría no existe.';
    else if (!category.isActive) message = `La categoría "${category.name}" está inactiva.`;

    if (message) {
      throw new ValidationError(undefined, [{ location: 'body', field: 'categoryId', message }]);
    }
    return category;
  }

  async ensureNameIsAvailable(name, { excludeId } = {}) {
    const existing = await this.expenseCategoryRepository.findByName(name, { excludeId });
    if (existing) {
      throw new ConflictError(`Ya existe la categoría "${existing.name}".`, {
        field: 'name',
        categoryId: existing.id,
      });
    }
  }
}

module.exports = { ExpenseCategoryService };
