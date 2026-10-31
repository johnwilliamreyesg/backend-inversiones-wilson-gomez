const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createLoanSchema, previewLoanSchema } = require('../../../src/validators/loan.validators');

const fieldsWithErrors = (result) => result.error.issues.map((issue) => issue.path.join('.'));

const MONTHLY = { clientId: 1, coDebtorId: 2, frequency: 'monthly', principalAmount: 1_000_000, monthlyInterestRate: 10 };
const BIWEEKLY = {
  clientId: 1,
  coDebtorId: 2,
  frequency: 'biweekly',
  principalAmount: 1_000_000,
  installmentAmount: 120_000,
  numberOfInstallments: 10,
};

describe('createLoanSchema', () => {
  it('accepts a monthly loan without term and a biweekly loan', () => {
    assert.equal(createLoanSchema.safeParse(MONTHLY).success, true);
    assert.equal(createLoanSchema.safeParse(BIWEEKLY).success, true);
  });

  it('requires the terms of each frequency', () => {
    const monthly = createLoanSchema.safeParse({ ...MONTHLY, monthlyInterestRate: undefined });
    assert.deepEqual(fieldsWithErrors(monthly), ['monthlyInterestRate']);

    const biweekly = createLoanSchema.safeParse({ ...BIWEEKLY, installmentAmount: undefined, numberOfInstallments: undefined });
    assert.deepEqual(fieldsWithErrors(biweekly).sort(), ['installmentAmount', 'numberOfInstallments']);
  });

  it('rejects an unknown frequency with a clear message', () => {
    const result = createLoanSchema.safeParse({ ...MONTHLY, frequency: 'weekly' });
    assert.match(result.error.issues[0].message, /monthly.*biweekly/);
  });

  it('the co-debtor must be another person', () => {
    const result = createLoanSchema.safeParse({ ...MONTHLY, coDebtorId: 1 });
    assert.deepEqual(fieldsWithErrors(result), ['coDebtorId']);
  });

  it('biweekly installments must cover the principal', () => {
    const result = createLoanSchema.safeParse({ ...BIWEEKLY, installmentAmount: 99_999 });
    assert.deepEqual(fieldsWithErrors(result), ['installmentAmount']);
    assert.equal(createLoanSchema.safeParse({ ...BIWEEKLY, installmentAmount: 100_000 }).success, true);
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
