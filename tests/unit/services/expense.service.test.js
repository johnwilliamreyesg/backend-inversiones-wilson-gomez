const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ExpenseService } = require('../../../src/services/expense.service');
const { ExpenseCategoryService } = require('../../../src/services/expense-category.service');
const { NotFoundError, ValidationError } = require('../../../src/errors/app-error');

const TODAY = '2026-10-31';

const createFakeExpenseRepository = (expenses = []) => ({
  rows: expenses.map((expense) => ({ ...expense })),
  lastQuery: null,
  async findAll(query) {
    this.lastQuery = query;
    return { items: this.rows, total: 45, totalAmount: 125000.5 };
  },
  async findById(id) {
    return this.rows.find((expense) => expense.id === id);
  },
  async create(data) {
    const expense = { id: this.rows.length + 1, ...data };
    this.rows.push(expense);
    return expense;
  },
  async update(id, data) {
    return Object.assign(await this.findById(id), data);
  },
  async softDelete(id) {
    this.rows = this.rows.filter((expense) => expense.id !== id);
    return true;
  },
});

// The real category service over a fake repository: tests the collaboration too.
const createCategoryService = () =>
  new ExpenseCategoryService({
    expenseCategoryRepository: {
      rows: [
        { id: 1, name: 'Transporte', isActive: true },
        { id: 2, name: 'Arriendo', isActive: false },
      ],
      async findById(id) {
        return this.rows.find((category) => category.id === id);
      },
    },
  });

const fieldOf = (error) => error.details[0].field;

describe('ExpenseService', () => {
  let expenseRepository;
  let service;

  beforeEach(() => {
    expenseRepository = createFakeExpenseRepository([
      { id: 1, categoryId: 2, expenseDate: '2026-10-01', amount: 900000, description: 'Arriendo oct' },
    ]);
    service = new ExpenseService({
      expenseRepository,
      expenseCategoryService: createCategoryService(),
      clock: { today: () => TODAY },
    });
  });

  it('lists with pagination metadata and the total amount of the filter', async () => {
    const result = await service.list({ from: '2026-10-01', page: 2, pageSize: 20 });
    assert.deepEqual(result.meta, {
      page: 2,
      pageSize: 20,
      total: 45,
      totalPages: 3,
      totalAmount: 125000.5,
    });
    assert.equal(expenseRepository.lastQuery.from, '2026-10-01');
  });

  describe('create', () => {
    it("defaults the date to today and stores who created it", async () => {
      const expense = await service.create(
        { categoryId: 1, amount: 15000, description: 'Taxi' },
        { userId: 7 },
      );
      assert.equal(expense.expenseDate, TODAY);
      assert.equal(expense.createdBy, 7);
    });

    it('accepts a past date and today', async () => {
      await service.create({ categoryId: 1, expenseDate: '2026-10-30', amount: 1, description: 'Bus' });
      await service.create({ categoryId: 1, expenseDate: TODAY, amount: 1, description: 'Bus' });
    });

    it('rejects a future date', async () => {
      await assert.rejects(
        service.create({ categoryId: 1, expenseDate: '2026-11-01', amount: 1, description: 'Bus' }),
        (error) => error instanceof ValidationError && fieldOf(error) === 'expenseDate',
      );
    });

    it('rejects a missing or inactive category on the categoryId field', async () => {
      for (const categoryId of [99, 2]) {
        await assert.rejects(
          service.create({ categoryId, amount: 1, description: 'X' }),
          (error) => error instanceof ValidationError && fieldOf(error) === 'categoryId',
        );
      }
    });
  });

  describe('update', () => {
    it('allows editing an expense whose category was later deactivated', async () => {
      const expense = await service.update(1, { categoryId: 2, amount: 950000 });
      assert.equal(expense.amount, 950000);
    });

    it('refuses moving an expense into an inactive category', async () => {
      expenseRepository.rows[0].categoryId = 1;
      await assert.rejects(service.update(1, { categoryId: 2 }), ValidationError);
    });

    it('rejects a future date and a missing expense', async () => {
      await assert.rejects(service.update(1, { expenseDate: '2027-01-01' }), ValidationError);
      await assert.rejects(service.update(99, { amount: 1 }), NotFoundError);
    });
  });

  describe('delete', () => {
    it('deletes and then the expense is gone', async () => {
      await service.delete(1);
      await assert.rejects(service.getById(1), NotFoundError);
      await assert.rejects(service.delete(1), NotFoundError);
    });
  });
});
