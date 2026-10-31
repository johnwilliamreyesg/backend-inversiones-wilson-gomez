const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MonthlyScheduleStrategy } = require('../../../src/services/loan-schedules/monthly-schedule-strategy');
const {
  BiweeklyScheduleStrategy,
  DUE_DATE_RULES,
} = require('../../../src/services/loan-schedules/biweekly-schedule-strategy');
const { LoanScheduleCalculator } = require('../../../src/services/loan-schedules/loan-schedule-calculator');

const ONE_PESO = 100; // rounding unit in cents
const sum = (installments, field) =>
  installments.reduce((total, installment) => total + Math.round(installment[field] * 100), 0) / 100;
const split = (installment) => [installment.principalDue, installment.interestDue, installment.amountDue];

describe('MonthlyScheduleStrategy', () => {
  const strategy = new MonthlyScheduleStrategy({ roundingUnitCents: ONE_PESO });

  it('fixed term: equal principal plus interest on the remaining balance', () => {
    const { installments } = strategy.buildSchedule({
      principalAmount: 1_000_000,
      monthlyInterestRate: 10,
      numberOfInstallments: 4,
      startDate: '2026-10-10',
    });
    assert.deepEqual(installments.map(split), [
      [250_000, 100_000, 350_000],
      [250_000, 75_000, 325_000],
      [250_000, 50_000, 300_000],
      [250_000, 25_000, 275_000],
    ]);
  });

  it('the last installment absorbs the rounding so principal adds up exactly', () => {
    const { installments } = strategy.buildSchedule({
      principalAmount: 1_000_000,
      monthlyInterestRate: 7.5,
      numberOfInstallments: 3,
      startDate: '2026-10-10',
    });
    assert.deepEqual(installments.map(({ principalDue }) => principalDue), [333_333, 333_333, 333_334]);
    assert.equal(sum(installments, 'principalDue'), 1_000_000);
  });

  it('open-ended: a single interest-only installment', () => {
    const { installments } = strategy.buildSchedule({
      principalAmount: 2_000_000,
      monthlyInterestRate: 5,
      startDate: '2026-10-10',
    });
    assert.equal(installments.length, 1);
    assert.deepEqual(split(installments[0]), [0, 100_000, 100_000]);
  });

  it('due dates: one month later by default; day 31 moves to the end of short months', () => {
    const result = strategy.buildSchedule({
      principalAmount: 400_000,
      monthlyInterestRate: 10,
      numberOfInstallments: 4,
      startDate: '2027-12-31',
    });
    assert.equal(result.paymentDay, 31);
    assert.deepEqual(
      result.installments.map(({ dueDate }) => dueDate),
      ['2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30'], // 2028 is a leap year
    );
  });

  it('respects an explicit payment day', () => {
    const { installments } = strategy.buildSchedule({
      principalAmount: 100_000,
      monthlyInterestRate: 10,
      numberOfInstallments: 1,
      startDate: '2026-10-20',
      paymentDay: 5,
    });
    assert.equal(installments[0].dueDate, '2026-11-05');
  });

  it('next open-ended installment: next month, interest on the current balance', () => {
    const next = strategy.nextOpenEndedInstallment({
      principalBalance: 600_000,
      monthlyInterestRate: 10,
      paymentDay: 31,
      previous: { installmentNumber: 3, dueDate: '2027-01-31' },
    });
    assert.deepEqual(next, {
      installmentNumber: 4,
      dueDate: '2027-02-28',
      principalDue: 0,
      interestDue: 60_000,
      amountDue: 60_000,
    });
  });

  it('rounds interest to the configured unit (e.g. $1.000)', () => {
    const rounded = new MonthlyScheduleStrategy({ roundingUnitCents: 1000 * 100 });
    const { installments } = rounded.buildSchedule({
      principalAmount: 1_234_567,
      monthlyInterestRate: 10,
      startDate: '2026-10-10',
    });
    assert.equal(installments[0].interestDue, 123_000);
  });
});

describe('BiweeklyScheduleStrategy', () => {
  it('splits the agreed installment into principal and interest (quote example)', () => {
    const strategy = new BiweeklyScheduleStrategy({ roundingUnitCents: ONE_PESO });
    const { installments } = strategy.buildSchedule({
      principalAmount: 1_000_000,
      installmentAmount: 120_000,
      numberOfInstallments: 10,
      startDate: '2026-10-31',
    });
    assert.equal(installments.length, 10);
    assert.ok(installments.every((installment) => installment.principalDue === 100_000));
    assert.ok(installments.every((installment) => installment.interestDue === 20_000));
  });

  it('every installment equals the agreed amount and totals add up exactly', () => {
    const strategy = new BiweeklyScheduleStrategy({ roundingUnitCents: ONE_PESO });
    const { installments } = strategy.buildSchedule({
      principalAmount: 500_000,
      installmentAmount: 85_000,
      numberOfInstallments: 7,
      startDate: '2026-10-31',
    });
    assert.ok(installments.every(({ amountDue }) => amountDue === 85_000));
    assert.equal(sum(installments, 'principalDue'), 500_000);
    assert.equal(sum(installments, 'interestDue'), 85_000 * 7 - 500_000);
  });

  it('every 15 days from the disbursement date', () => {
    const strategy = new BiweeklyScheduleStrategy({ roundingUnitCents: ONE_PESO });
    const { installments, paymentDay } = strategy.buildSchedule({
      principalAmount: 300_000,
      installmentAmount: 110_000,
      numberOfInstallments: 3,
      startDate: '2026-12-20',
    });
    assert.deepEqual(installments.map(({ dueDate }) => dueDate), ['2027-01-04', '2027-01-19', '2027-02-03']);
    assert.equal(paymentDay, 4);
  });

  it('fixed dates: 15th and last day of month, skipping one closer than 8 days', () => {
    const strategy = new BiweeklyScheduleStrategy({
      roundingUnitCents: ONE_PESO,
      dueDateRule: DUE_DATE_RULES.FIXED_15_AND_END_OF_MONTH,
    });
    const { installments } = strategy.buildSchedule({
      principalAmount: 300_000,
      installmentAmount: 80_000,
      numberOfInstallments: 4,
      startDate: '2027-02-10', // Feb 15 is only 5 days away
    });
    assert.deepEqual(
      installments.map(({ dueDate }) => dueDate),
      ['2027-02-28', '2027-03-15', '2027-03-31', '2027-04-15'],
    );
  });

  it('refuses an unknown due date rule', () => {
    assert.throws(() => new BiweeklyScheduleStrategy({ roundingUnitCents: 100, dueDateRule: 'weekly' }));
  });
});

describe('LoanScheduleCalculator', () => {
  it('picks the strategy by frequency and adds totals', () => {
    const calculator = new LoanScheduleCalculator({
      strategies: {
        monthly: new MonthlyScheduleStrategy({ roundingUnitCents: ONE_PESO }),
        biweekly: new BiweeklyScheduleStrategy({ roundingUnitCents: ONE_PESO }),
      },
    });
    const result = calculator.calculate({
      frequency: 'biweekly',
      principalAmount: 1_000_000,
      installmentAmount: 120_000,
      numberOfInstallments: 10,
      startDate: '2026-10-31',
    });
    assert.deepEqual(result.totals, { principal: 1_000_000, interest: 200_000, amount: 1_200_000 });
    assert.throws(() => calculator.forFrequency('weekly'), /No schedule strategy/);
  });
});
