const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ExpenseCategoryService } = require('../../../src/services/expense-category.service');
const { NotFoundError, ConflictError } = require('../../../src/errors/app-error');

const createFakeRepository = (categories = []) => ({
  rows: categories.map((category) => ({ ...category })),
  async findAll({ includeInactive }) {
    return this.rows.filter((category) => includeInactive || category.isActive);
  },
  async findById(id) {
    return this.rows.find((category) => category.id === id);
  },
  async findByName(name, { excludeId } = {}) {
    return this.rows.find(
      (category) => category.name.toLowerCase() === name.toLowerCase() && category.id !== excludeId,
    );
  },
  async create(data) {
    const category = { id: this.rows.length + 1, isActive: true, ...data };
    this.rows.push(category);
    return category;
  },
  async update(id, data) {
    return Object.assign(await this.findById(id), data);
  },
});

describe('ExpenseCategoryService', () => {
  let service;

  beforeEach(() => {
    service = new ExpenseCategoryService({
      expenseCategoryRepository: createFakeRepository([
        { id: 1, name: 'Transporte', isActive: true },
        { id: 2, name: 'Arriendo', isActive: false },
      ]),
    });
  });

  it('lists only active categories unless asked for all', async () => {
    assert.equal((await service.list({ includeInactive: false })).length, 1);
    assert.equal((await service.list({ includeInactive: true })).length, 2);
  });

  it('creates a category', async () => {
    assert.equal((await service.create({ name: 'Papelería' })).name, 'Papelería');
  });

  it('rejects a duplicate name ignoring case', async () => {
    await assert.rejects(service.create({ name: 'TRANSPORTE' }), (error) => {
      assert.ok(error instanceof ConflictError);
      assert.match(error.message, /"Transporte"/);
      return true;
    });
  });

  it('allows renaming to the same name with other casing, but not to another category', async () => {
    assert.equal((await service.update(1, { name: 'transporte' })).name, 'transporte');
    await assert.rejects(service.update(1, { name: 'arriendo' }), ConflictError);
  });

  it('deactivates and reactivates', async () => {
    assert.equal((await service.update(1, { isActive: false })).isActive, false);
    assert.equal((await service.update(1, { isActive: true })).isActive, true);
  });

  it('throws NotFoundError for a missing category', async () => {
    await assert.rejects(service.update(99, { name: 'X' }), NotFoundError);
  });
});
