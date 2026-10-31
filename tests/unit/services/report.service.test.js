const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ReportService } = require('../../../src/services/report.service');
const { ValidationError } = require('../../../src/errors/app-error');

const row = (overrides) => ({
  interestCollected: 0,
  principalCollected: 0,
  paymentsCount: 0,
  disbursed: 0,
  loansCreated: 0,
  expenses: 0,
  ...overrides,
});

const createService = ({ daily = [], monthly = [] } = {}) => {
  const calls = {};
  const reportRepository = {
    async daily(range) {
      calls.daily = range;
      return daily;
    },
    async monthly(query) {
      calls.monthly = query;
      return monthly;
    },
  };
  return { calls, service: new ReportService({ reportRepository, clock: { today: () => '2026-10-31' } }) };
};

describe('ReportService', () => {
  it('daily defaults to the current month up to today', async () => {
    const { service, calls } = createService();
    const report = await service.daily({});
    assert.deepEqual(calls.daily, { from: '2026-10-01', to: '2026-10-31' });
    assert.equal(report.from, '2026-10-01');
  });

  it('adds total collected and net profit (interest minus expenses) per day and in totals', async () => {
    const { service } = createService({
      daily: [
        row({ date: '2026-10-30', interestCollected: 20_000.5, principalCollected: 100_000, paymentsCount: 1, expenses: 5_000 }),
        row({ date: '2026-10-31', interestCollected: 40_000, principalCollected: 0, paymentsCount: 2, disbursed: 1_000_000, loansCreated: 1 }),
      ],
    });
    const { rows, totals } = await service.daily({});
    assert.equal(rows[0].totalCollected, 120_000.5);
    assert.equal(rows[0].netProfit, 15_000.5);
    assert.deepEqual(totals, {
      interestCollected: 60_000.5,
      principalCollected: 100_000,
      disbursed: 1_000_000,
      expenses: 5_000,
      paymentsCount: 3,
      loansCreated: 1,
      totalCollected: 160_000.5,
      netProfit: 55_000.5,
    });
  });

  it('refuses ranges longer than a year', async () => {
    const { service } = createService();
    await assert.rejects(service.daily({ from: '2025-01-01', to: '2026-10-31' }), ValidationError);
  });

  it('monthly computes effectiveness, null when nothing was due', async () => {
    const { service, calls } = createService({
      monthly: [
        row({ month: '2026-09', installmentsDue: 0, amountDue: 0, amountCollectedOnDue: 0 }),
        row({ month: '2026-10', installmentsDue: 4, amountDue: 400_000, amountCollectedOnDue: 300_000 }),
        row({ month: '2026-11', installmentsDue: 2, amountDue: 200_000, amountCollectedOnDue: 50_000 }),
      ],
    });
    const { year, rows, totals } = await service.monthly({});
    assert.equal(year, 2026);
    assert.deepEqual(calls.monthly, { year: 2026 });
    assert.deepEqual(rows.map(({ effectiveness }) => effectiveness), [null, 75, 25]);
    assert.equal(totals.installmentsDue, 6);
    assert.equal(totals.effectiveness, 58.33);
  });
});
