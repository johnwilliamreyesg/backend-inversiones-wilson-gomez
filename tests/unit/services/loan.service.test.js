const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { LoanService } = require('../../../src/services/loan.service');
const { LoanScheduleCalculator } = require('../../../src/services/loan-schedules/loan-schedule-calculator');
const { MonthlyScheduleStrategy } = require('../../../src/services/loan-schedules/monthly-schedule-strategy');
const { BiweeklyScheduleStrategy } = require('../../../src/services/loan-schedules/biweekly-schedule-strategy');
const { LoanScheduleKeeper } = require('../../../src/services/loan-schedules/loan-schedule-keeper');
const { NotFoundError, ConflictError, ValidationError } = require('../../../src/errors/app-error');

const TODAY = '2026-10-31';

// Fakes keep everything in memory; the transaction just runs the callback.
const createFakes = ({ activePayments = 0 } = {}) => {
  const loans = [];
  const installments = [];
  return {
    loans,
    installments,
    loanRepository: {
      async create(data) {
        loans.push({ id: loans.length + 1, status: 'active', ...data });
        return loans.length;
      },
      async findById(id) {
        return loans.find((loan) => loan.id === id);
      },
      async update(id, data) {
        Object.assign(loans.find((loan) => loan.id === id), data);
      },
    },
    loanInstallmentRepository: {
      async createMany(loanId, rows) {
        rows.forEach((row) =>
          installments.push({ loanId, principalPaid: 0, interestPaid: 0, status: 'pending', ...row }),
        );
      },
      async findByLoanId(loanId) {
        return installments.filter((row) => row.loanId === loanId);
      },
      async cancelOpenByLoanId(loanId) {
        installments
          .filter((row) => row.loanId === loanId && ['pending', 'partially_paid'].includes(row.status))
          .forEach((row) => Object.assign(row, { status: 'cancelled' }));
      },
    },
    paymentRepository: { countActiveByLoanId: async () => activePayments },
    clientRepository: { findById: async (id) => (id <= 2 ? { id } : undefined) },
    transactionManager: { run: (work) => work('trx') },
  };
};

const buildService = (fakes) => {
  const clock = { today: () => TODAY };
  const monthlyStrategy = new MonthlyScheduleStrategy({ roundingUnitCents: 100 });
  return new LoanService({
    ...fakes,
    scheduleCalculator: new LoanScheduleCalculator({
      strategies: {
        monthly: monthlyStrategy,
        biweekly: new BiweeklyScheduleStrategy({ roundingUnitCents: 100 }),
      },
    }),
    scheduleKeeper: new LoanScheduleKeeper({ ...fakes, monthlyStrategy, clock }),
    clock,
  });
};

const BIWEEKLY = {
  clientId: 1,
  coDebtorId: 2,
  frequency: 'biweekly',
  principalAmount: 1_000_000,
  installmentAmount: 120_000,
  numberOfInstallments: 10,
};

describe('LoanService', () => {
  let fakes;
  let service;

  beforeEach(() => {
    fakes = createFakes();
    service = buildService(fakes);
  });

  it('creates the loan with its full schedule; balance starts at the principal', async () => {
    const loan = await service.create(BIWEEKLY, { userId: 7 });
    assert.equal(loan.startDate, TODAY);
    assert.equal(loan.principalBalance, 1_000_000);
    assert.equal(loan.createdBy, 7);
    assert.equal(loan.paymentDay, 15);
    assert.equal(loan.installments.length, 10);
    assert.deepEqual(loan.summary, {
      totalDue: 1_200_000,
      totalPaid: 0,
      totalRemaining: 1_200_000,
      overdueInstallments: 0,
      overdueAmount: 0,
      nextDueDate: '2026-11-15',
    });
  });

  it('a loan registered with a past date shows its overdue installments', async () => {
    const loan = await service.create({ ...BIWEEKLY, startDate: '2026-09-30' });
    // Due 2026-10-15 and 2026-10-30, today is 2026-10-31.
    assert.equal(loan.summary.overdueInstallments, 2);
    assert.equal(loan.summary.overdueAmount, 240_000);
    assert.deepEqual(
      loan.installments.slice(0, 3).map(({ daysOverdue }) => daysOverdue),
      [16, 1, 0],
    );
  });

  it('rejects a future disbursement date', async () => {
    await assert.rejects(
      service.create({ ...BIWEEKLY, startDate: '2026-11-01' }),
      (error) => error instanceof ValidationError && error.details[0].field === 'startDate',
    );
  });

  it('rejects a client or co-debtor that does not exist, on its field', async () => {
    await assert.rejects(
      service.create({ ...BIWEEKLY, clientId: 9 }),
      (error) => error.details[0].field === 'clientId',
    );
    await assert.rejects(
      service.create({ ...BIWEEKLY, coDebtorId: 9 }),
      (error) => error.details[0].field === 'coDebtorId',
    );
    assert.equal(fakes.loans.length, 0);
  });

  it('stores only the terms of its frequency (others as null)', async () => {
    await service.create({ ...BIWEEKLY, frequency: 'monthly', monthlyInterestRate: 10, installmentAmount: undefined, numberOfInstallments: undefined });
    assert.equal(fakes.loans[0].installmentAmount, null);
    assert.equal(fakes.loans[0].numberOfInstallments, null);
    assert.equal(fakes.installments.length, 1); // open-ended: one installment at a time
  });

  it('open-ended loan with a past date gets every month owed plus the next one', async () => {
    const loan = await service.create({
      clientId: 1,
      coDebtorId: 2,
      frequency: 'monthly',
      principalAmount: 2_000_000,
      monthlyInterestRate: 5,
      startDate: '2026-08-31',
    });
    // Today is 2026-10-31: September and October are due, November is next.
    assert.deepEqual(
      loan.installments.map(({ dueDate, interestDue }) => [dueDate, interestDue]),
      [['2026-09-30', 100_000], ['2026-10-31', 100_000], ['2026-11-30', 100_000]],
    );
    assert.equal(loan.summary.overdueInstallments, 1); // due today is not overdue yet
    assert.equal(loan.summary.nextDueDate, '2026-09-30');
  });

  it('fixed-term loans are never extended by the keeper', async () => {
    const loan = await service.create({
      clientId: 1,
      coDebtorId: 2,
      frequency: 'monthly',
      principalAmount: 300_000,
      monthlyInterestRate: 5,
      numberOfInstallments: 1,
      startDate: '2026-01-15',
    });
    assert.equal(loan.installments.length, 1);
  });

  it('preview calculates without saving', () => {
    const result = service.preview({ ...BIWEEKLY, clientId: undefined, coDebtorId: undefined });
    assert.equal(result.installments.length, 10);
    assert.equal(fakes.loans.length, 0);
  });

  describe('cancel', () => {
    it('cancels a loan without payments and its open installments', async () => {
      await service.create(BIWEEKLY);
      const loan = await service.cancel(1);
      assert.equal(loan.status, 'cancelled');
      assert.ok(loan.installments.every(({ status }) => status === 'cancelled'));
      assert.equal(loan.summary.totalDue, 0);
    });

    it('refuses a loan with payments, an inactive one, or a missing one', async () => {
      fakes = createFakes({ activePayments: 2 });
      service = buildService(fakes);
      await service.create(BIWEEKLY);
      await assert.rejects(service.cancel(1), /2 pago\(s\)/);

      fakes.loans[0].status = 'paid_off';
      await assert.rejects(service.cancel(1), ConflictError);
      await assert.rejects(service.cancel(99), NotFoundError);
    });
  });
});
