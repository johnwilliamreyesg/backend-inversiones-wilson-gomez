const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createLoanSchema, previewLoanSchema, listLoansQuerySchema } = require('../../../src/validators/loan.validators');

const fieldsWithErrors = (result) => result.error.issues.map((issue) => issue.path.join('.'));

const MONTHLY = { clientId: 1, coDebtorId: 2, frequency: 'monthly', principalAmount: 1_000_000, monthlyInterestRate: 10 };
const BIWEEKLY = {
  clientId: 1,
  coDebtorId: 2,
  frequency: 'biweekly',
  principalAmount: 1_000_000,
  monthlyInterestRate: 10,
  numberOfInstallments: 4,
};

describe('createLoanSchema', () => {
  it('accepts a monthly loan without term and a biweekly loan', () => {
    assert.equal(createLoanSchema.safeParse(MONTHLY).success, true);
    assert.equal(createLoanSchema.safeParse(BIWEEKLY).success, true);
  });

  it('requires the terms of each frequency', () => {
    const monthly = createLoanSchema.safeParse({ ...MONTHLY, monthlyInterestRate: undefined });
    assert.deepEqual(fieldsWithErrors(monthly), ['monthlyInterestRate']);

    const biweekly = createLoanSchema.safeParse({ ...BIWEEKLY, monthlyInterestRate: undefined, numberOfInstallments: undefined });
    assert.deepEqual(fieldsWithErrors(biweekly).sort(), ['monthlyInterestRate', 'numberOfInstallments']);
  });

  it('rejects an unknown frequency with a clear message', () => {
    const result = createLoanSchema.safeParse({ ...MONTHLY, frequency: 'weekly' });
    assert.match(result.error.issues[0].message, /monthly.*biweekly/);
  });

  it('the co-debtor is optional, but must be another person', () => {
    assert.equal(createLoanSchema.safeParse({ ...MONTHLY, coDebtorId: undefined }).data.coDebtorId, null);
    assert.equal(createLoanSchema.safeParse({ ...MONTHLY, coDebtorId: null }).success, true);
    assert.deepEqual(fieldsWithErrors(createLoanSchema.safeParse({ ...MONTHLY, coDebtorId: 1 })), ['coDebtorId']);
  });

  it('biweekly: collection days default to 15 and 30', () => {
    const { data } = createLoanSchema.safeParse(BIWEEKLY);
    assert.deepEqual([data.paymentDay, data.secondPaymentDay], [15, 30]);
  });

  it('biweekly: the two collection days must be at least 7 days apart', () => {
    assert.equal(createLoanSchema.safeParse({ ...BIWEEKLY, paymentDay: 5, secondPaymentDay: 20 }).success, true);
    assert.deepEqual(fieldsWithErrors(createLoanSchema.safeParse({ ...BIWEEKLY, paymentDay: 15, secondPaymentDay: 18 })), ['secondPaymentDay']);
    // 2 and 30 are 4 days apart across the month change.
    assert.deepEqual(fieldsWithErrors(createLoanSchema.safeParse({ ...BIWEEKLY, paymentDay: 2, secondPaymentDay: 30 })), ['secondPaymentDay']);
  });

  it('limits the rate and the payment day', () => {
    assert.equal(createLoanSchema.safeParse({ ...MONTHLY, monthlyInterestRate: 0 }).success, false);
    assert.equal(createLoanSchema.safeParse({ ...MONTHLY, monthlyInterestRate: 10.555 }).success, false);
    assert.equal(createLoanSchema.safeParse({ ...MONTHLY, paymentDay: 32 }).success, false);
  });
});

describe('previewLoanSchema', () => {
  it('does not need client or co-debtor', () => {
    const { clientId, coDebtorId, ...terms } = BIWEEKLY;
    assert.equal(previewLoanSchema.safeParse(terms).success, true);
  });
});

describe('listLoansQuerySchema', () => {
  it('accepts every loan status the screens filter by, written-off included', () => {
    for (const status of ['active', 'paid_off', 'defaulted', 'cancelled', 'written_off']) {
      assert.equal(listLoansQuerySchema.safeParse({ status }).success, true, status);
    }
    assert.equal(listLoansQuerySchema.safeParse({ status: 'lost' }).success, false);
  });
});
