const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { InstallmentRescheduler } = require('../../../src/services/payments/installment-rescheduler');
const { LoanScheduleCalculator } = require('../../../src/services/loan-schedules/loan-schedule-calculator');
const { MonthlyScheduleStrategy } = require('../../../src/services/loan-schedules/monthly-schedule-strategy');
const { BiweeklyScheduleStrategy } = require('../../../src/services/loan-schedules/biweekly-schedule-strategy');

const roundingUnitCents = 100;
const rescheduler = new InstallmentRescheduler({
  roundingUnitCents,
  scheduleCalculator: new LoanScheduleCalculator({
    strategies: {
      monthly: new MonthlyScheduleStrategy({ roundingUnitCents }),
      biweekly: new BiweeklyScheduleStrategy({ roundingUnitCents }),
    },
  }),
});

const installment = (id, principalDue, interestDue) => ({
  id,
  principalDue,
  interestDue,
  amountDue: principalDue + interestDue,
  status: 'pending',
});

// [principal, interest, status] per installment, in pesos.
const summary = (rows) => rows.map((row) => [row.principalDue, row.interestDue, row.status]);

describe('InstallmentRescheduler — monthly loan with term', () => {
  // 1.200.000 at 5 % in 4 installments; the first one is paid, 900.000 still owed.
  const loan = { frequency: 'monthly', monthlyInterestRate: 5 };
  const remaining = [installment(2, 300_000, 45_000), installment(3, 300_000, 30_000), installment(4, 300_000, 15_000)];
  const prepay = (recalculation) =>
    rescheduler.reschedule({ loan, installments: remaining, prepaymentCents: 300_000 * 100, recalculation });

  it('reduce_installment: same 3 installments, smaller, interest on the new balance', () => {
    assert.deepEqual(summary(prepay('reduce_installment')), [
      [200_000, 30_000, 'pending'],
      [200_000, 20_000, 'pending'],
      [200_000, 10_000, 'pending'],
    ]);
  });

  it('reduce_term: the last installment disappears, the others keep their principal', () => {
    assert.deepEqual(summary(prepay('reduce_term')), [
      [300_000, 30_000, 'pending'],
      [300_000, 15_000, 'pending'],
      [0, 0, 'cancelled'],
    ]);
  });

  it('every amountDue is principal + interest', () => {
    for (const row of prepay('reduce_installment')) assert.equal(row.amountDue, row.principalDue + row.interestDue);
  });
});

describe('InstallmentRescheduler — biweekly loan', () => {
  // Agreed installment 120.000 = 100.000 principal + 20.000 interest.
  const loan = { frequency: 'biweekly' };
  const remaining = [installment(8, 100_000, 20_000), installment(9, 100_000, 20_000), installment(10, 100_000, 20_000)];
  const prepay = (recalculation, pesos = 150_000) =>
    rescheduler.reschedule({ loan, installments: remaining, prepaymentCents: pesos * 100, recalculation });

  it('reduce_installment: half the principal left, so each installment carries half the interest', () => {
    assert.deepEqual(summary(prepay('reduce_installment')), [
      [50_000, 10_000, 'pending'],
      [50_000, 10_000, 'pending'],
      [50_000, 10_000, 'pending'],
    ]);
  });

  it('reduce_term: the installments that lose all their principal lose their interest too', () => {
    assert.deepEqual(summary(prepay('reduce_term')), [
      [100_000, 20_000, 'pending'],
      [50_000, 10_000, 'pending'],
      [0, 0, 'cancelled'],
    ]);
  });

  it('prepaying the whole principal cancels every installment', () => {
    assert.ok(prepay('reduce_installment', 300_000).every(({ status }) => status === 'cancelled'));
  });

  it('the rounding remainder goes to the last installment, so principal adds up exactly', () => {
    const rows = prepay('reduce_installment', 100_000.5);
    const principalCents = rows.reduce((total, row) => total + Math.round(row.principalDue * 100), 0);
    assert.equal(principalCents, 199_999.5 * 100);
  });
});
