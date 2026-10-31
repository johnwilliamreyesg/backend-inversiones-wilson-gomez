const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createExpenseSchema,
  updateExpenseSchema,
  listExpensesQuerySchema,
} = require('../../../src/validators/expense.validators');
const { listExpenseCategoriesQuerySchema } = require('../../../src/validators/expense-category.validators');

const fieldsWithErrors = (result) => result.error.issues.map((issue) => issue.path.join('.'));

describe('createExpenseSchema', () => {
  it('accepts a valid expense and trims the description', () => {
    const result = createExpenseSchema.parse({
      categoryId: 1,
      expenseDate: '2026-10-31',
      amount: 15000.5,
      description: '  Taxi  ',
    });
    assert.deepEqual(result, {
      categoryId: 1,
      expenseDate: '2026-10-31',
      amount: 15000.5,
      description: 'Taxi',
    });
  });

  it('leaves the date out when not sent (the service defaults it)', () => {
    const result = createExpenseSchema.parse({ categoryId: 1, amount: 1, description: 'Bus' });
    assert.equal('expenseDate' in result, false);
  });

  it('rejects impossible dates, bad amounts and missing fields', () => {
    const result = createExpenseSchema.safeParse({ expenseDate: '2026-02-30', amount: -5 });
    assert.deepEqual(fieldsWithErrors(result).sort(), [
      'amount',
      'categoryId',
      'description',
      'expenseDate',
    ]);
  });

  it('accepts 2 decimals but not 3, and rejects amounts sent as text', () => {
    assert.equal(createExpenseSchema.safeParse({ categoryId: 1, amount: 0.07, description: 'Bus' }).success, true);
    assert.equal(createExpenseSchema.safeParse({ categoryId: 1, amount: 1.005, description: 'Bus' }).success, false);
    assert.equal(createExpenseSchema.safeParse({ categoryId: 1, amount: '1000', description: 'Bus' }).success, false);
  });
});

describe('updateExpenseSchema', () => {
  it('requires at least one field', () => {
    assert.equal(updateExpenseSchema.safeParse({}).success, false);
    assert.equal(updateExpenseSchema.safeParse({ amount: 10 }).success, true);
  });
});

describe('listExpensesQuerySchema', () => {
  it('coerces query strings and applies pagination defaults', () => {
    const result = listExpensesQuerySchema.parse({ categoryId: '3', from: '2026-10-01', to: '2026-10-31' });
    assert.deepEqual(result, { categoryId: 3, from: '2026-10-01', to: '2026-10-31', page: 1, pageSize: 20 });
  });

  it('rejects a range that ends before it starts', () => {
    const result = listExpensesQuerySchema.safeParse({ from: '2026-10-31', to: '2026-10-01' });
    assert.deepEqual(fieldsWithErrors(result), ['from']);
  });
});

describe('listExpenseCategoriesQuerySchema', () => {
  it('reads includeInactive as a real boolean ("false" stays false)', () => {
    assert.equal(listExpenseCategoriesQuerySchema.parse({}).includeInactive, false);
    assert.equal(listExpenseCategoriesQuerySchema.parse({ includeInactive: 'false' }).includeInactive, false);
    assert.equal(listExpenseCategoriesQuerySchema.parse({ includeInactive: 'true' }).includeInactive, true);
    assert.equal(listExpenseCategoriesQuerySchema.safeParse({ includeInactive: 'yes' }).success, false);
  });
});
