const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { InstallmentDueDateService } = require('../../../src/services/installment-due-date.service');
const { NotFoundError, ConflictError, ValidationError } = require('../../../src/errors/app-error');

const installment = (id, installmentNumber, dueDate, status = 'pending') => ({ id, installmentNumber, dueDate, status });

const createService = ({ frequency = 'monthly', loanStatus = 'active' } = {}) => {
  const loan = { id: 1, frequency, status: loanStatus, startDate: '2026-09-15', paymentDay: 15 };
  const installments =
    frequency === 'monthly'
      ? [
          installment(11, 1, '2026-10-15', 'paid'),
          installment(12, 2, '2026-11-15'),
          installment(13, 3, '2026-12-15'),
          installment(14, 4, '2027-01-15'),
        ]
      : [installment(21, 1, '2026-10-01'), installment(22, 2, '2026-10-16'), installment(23, 3, '2026-10-31')];
  const changes = [];
  const service = new InstallmentDueDateService({
    loanRepository: {
      findById: async (id) => (id === 1 ? loan : undefined),
      update: async (id, data) => Object.assign(loan, data),
    },
    loanInstallmentRepository: {
      findByLoanId: async () => installments,
      update: async (id, data) => Object.assign(installments.find((row) => row.id === id), data),
    },
    dueDateChangeRepository: {
      createMany: async (rows) => changes.push(...rows.map((row, index) => ({ id: changes.length + index + 1, ...row }))),
      findByPaymentId: async (paymentId) => changes.filter((change) => change.paymentId === paymentId),
      findByLoanId: async () => changes,
    },
    loanService: { getById: async () => ({ ...loan, installments }) },
    transactionManager: { run: (work) => work('trx') },
  });
  const dates = () => installments.map(({ dueDate }) => dueDate);
  return { service, loan, installments, changes, dates };
};

describe('InstallmentDueDateService — moving dates by hand', () => {
  let ctx;
  beforeEach(() => {
    ctx = createService();
  });

  it('moves only one installment and records the previous date, reason and user', async () => {
    await ctx.service.reschedule(1, 12, { dueDate: '2026-11-25', reason: 'Le pagan el 25' }, { userId: 7 });
    assert.deepEqual(ctx.dates(), ['2026-10-15', '2026-11-25', '2026-12-15', '2027-01-15']);
    assert.deepEqual(
      ctx.changes.map(({ installmentId, previousDueDate, newDueDate, reason, changedBy }) => [installmentId, previousDueDate, newDueDate, reason, changedBy]),
      [[12, '2026-11-15', '2026-11-25', 'Le pagan el 25', 7]],
    );
    assert.equal(ctx.loan.paymentDay, 15);
  });

  it('monthly: moving the following ones keeps one per month on the new day, and it becomes the payment day', async () => {
    await ctx.service.reschedule(1, 12, { dueDate: '2026-11-30', applyToFollowing: true });
    // 30 does not exist in February: that month falls on its last day.
    assert.deepEqual(ctx.dates(), ['2026-10-15', '2026-11-30', '2026-12-30', '2027-01-30']);
    assert.equal(ctx.loan.paymentDay, 30);
    assert.equal(ctx.changes.length, 3);
  });

  it('biweekly: the following ones stay 15 days apart', async () => {
    ctx = createService({ frequency: 'biweekly' });
    await ctx.service.reschedule(1, 22, { dueDate: '2026-10-20', applyToFollowing: true });
    assert.deepEqual(ctx.dates(), ['2026-10-01', '2026-10-20', '2026-11-04']);
  });

  it('refuses a paid installment, a date before the disbursement, a missing one or a closed loan', async () => {
    await assert.rejects(ctx.service.reschedule(1, 11, { dueDate: '2026-11-01' }), ConflictError);
    await assert.rejects(
      ctx.service.reschedule(1, 12, { dueDate: '2026-09-01' }),
      (error) => error instanceof ValidationError && error.details[0].field === 'dueDate',
    );
    await assert.rejects(ctx.service.reschedule(1, 99, { dueDate: '2026-11-20' }), NotFoundError);
    await assert.rejects(createService({ loanStatus: 'paid_off' }).service.reschedule(1, 12, { dueDate: '2026-11-20' }), ConflictError);
  });
});

describe('InstallmentDueDateService — interest-only payment', () => {
  it('moves what is left of the installment, and voiding the payment puts the date back', async () => {
    const ctx = createService();
    const [, second] = ctx.installments;
    await ctx.service.rescheduleForPayment({ loanId: 1, installments: [second], dueDate: '2026-11-28', paymentId: 50, userId: 7, trx: 'trx' });
    assert.equal(second.dueDate, '2026-11-28');
    assert.equal(ctx.changes[0].paymentId, 50);

    await ctx.service.undoForPayment({ paymentId: 50, userId: 7, trx: 'trx' });
    assert.equal(second.dueDate, '2026-11-15');
    assert.match(ctx.changes.at(-1).reason, /anuló el pago #50/);
  });

  it('does not undo a date that was moved again by hand afterwards', async () => {
    const ctx = createService();
    const [, second] = ctx.installments;
    await ctx.service.rescheduleForPayment({ loanId: 1, installments: [second], dueDate: '2026-11-28', paymentId: 50, userId: 7, trx: 'trx' });
    await ctx.service.reschedule(1, 12, { dueDate: '2026-12-02' });
    await ctx.service.undoForPayment({ paymentId: 50, userId: 7, trx: 'trx' });
    assert.equal(second.dueDate, '2026-12-02');
  });
});
