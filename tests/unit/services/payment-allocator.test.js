const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { PaymentAllocator } = require('../../../src/services/payments/payment-allocator');
const { installmentStatusFor } = require('../../../src/services/payments/installment-status');
const { ValidationError } = require('../../../src/errors/app-error');

const allocator = new PaymentAllocator();

const installment = (id, dueDate, principalDue, interestDue, paid = {}) => ({
  id,
  dueDate,
  principalDue,
  interestDue,
  principalPaid: paid.principal ?? 0,
  interestPaid: paid.interest ?? 0,
});

// Biweekly 100.000 principal + 20.000 interest per installment
const FIXED = [
  installment(1, '2026-10-15', 100_000, 20_000),
  installment(2, '2026-10-30', 100_000, 20_000),
  installment(3, '2026-11-14', 100_000, 20_000),
];

const pesos = ({ allocations, extraPrincipalCents }) => ({
  allocations: allocations.map((a) => [a.installmentId, a.interestCents / 100, a.principalCents / 100]),
  extra: extraPrincipalCents / 100,
});

describe('PaymentAllocator — fixed-term loans', () => {
  it('a partial payment goes to interest first', () => {
    const result = allocator.allocate({ amount: 50_000, installments: FIXED, isOpenEnded: false, paymentDate: '2026-10-31' });
    assert.deepEqual(pesos(result), { allocations: [[1, 20_000, 30_000]], extra: 0 });
  });

  it('covers the oldest installment fully, then the next one', () => {
    const result = allocator.allocate({ amount: 150_000, installments: FIXED, isOpenEnded: false, paymentDate: '2026-10-31' });
    assert.deepEqual(pesos(result).allocations, [[1, 20_000, 100_000], [2, 20_000, 10_000]]);
  });

  it('continues an installment that was partially paid', () => {
    const installments = [installment(1, '2026-10-15', 100_000, 20_000, { interest: 20_000, principal: 30_000 }), ...FIXED.slice(1)];
    const result = allocator.allocate({ amount: 70_000, installments, isOpenEnded: false, paymentDate: '2026-10-31' });
    assert.deepEqual(pesos(result).allocations, [[1, 0, 70_000]]);
  });

  it('allows paying ahead (future installments) up to the total owed', () => {
    const result = allocator.allocate({ amount: 360_000, installments: FIXED, isOpenEnded: false, paymentDate: '2026-10-31' });
    assert.equal(result.allocations.length, 3);
  });

  it('rejects more than what is owed, telling the maximum', () => {
    assert.throws(
      () => allocator.allocate({ amount: 360_001, installments: FIXED, isOpenEnded: false, paymentDate: '2026-10-31' }),
      (error) => error instanceof ValidationError && /360\.000/.test(error.message),
    );
  });
});

describe('PaymentAllocator — open-ended monthly loans', () => {
  // 2.000.000 at 5 %: interest-only installments of 100.000
  const OPEN = [
    installment(1, '2026-09-30', 0, 100_000),
    installment(2, '2026-10-31', 0, 100_000),
    installment(3, '2026-11-30', 0, 100_000),
  ];
  const base = { installments: OPEN, isOpenEnded: true, paymentDate: '2026-10-31', principalBalance: 2_000_000 };

  it('pays the interest already due, oldest first', () => {
    const result = allocator.allocate({ ...base, amount: 150_000 });
    assert.deepEqual(pesos(result), { allocations: [[1, 100_000, 0], [2, 50_000, 0]], extra: 0 });
  });

  it('what exceeds the due interest is a principal prepayment, not next month interest', () => {
    const result = allocator.allocate({ ...base, amount: 700_000 });
    assert.deepEqual(pesos(result), { allocations: [[1, 100_000, 0], [2, 100_000, 0]], extra: 500_000 });
  });

  it('can pay off the loan: due interest + whole balance, never more', () => {
    assert.equal(allocator.allocate({ ...base, amount: 2_200_000 }).extraPrincipalCents, 2_000_000 * 100);
    assert.throws(() => allocator.allocate({ ...base, amount: 2_200_001 }), ValidationError);
  });
});

describe('installmentStatusFor', () => {
  it('pending, partially paid or paid', () => {
    const due = { principalDue: 100_000, interestDue: 20_000 };
    assert.equal(installmentStatusFor({ ...due, principalPaid: 0, interestPaid: 0 }), 'pending');
    assert.equal(installmentStatusFor({ ...due, principalPaid: 0, interestPaid: 20_000 }), 'partially_paid');
    assert.equal(installmentStatusFor({ ...due, principalPaid: 100_000, interestPaid: 20_000 }), 'paid');
  });
});
