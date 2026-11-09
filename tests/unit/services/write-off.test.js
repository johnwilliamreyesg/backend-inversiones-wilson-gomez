const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { buildAgreementSchedule } = require('../../../src/services/write-offs/agreement-schedule');
const { WriteOffService } = require('../../../src/services/write-off.service');
const { ConflictError, ValidationError } = require('../../../src/errors/app-error');

const ONE_PESO = 100;

describe('buildAgreementSchedule (payment agreement for a written-off loan)', () => {
  const base = { previousBalance: 900_000, numberOfInstallments: 3, frequency: 'monthly', firstDueDate: '2026-11-30', firstInstallmentNumber: 5, roundingUnitCents: ONE_PESO };

  it('agreeing less than the balance forgives the rest of the principal', () => {
    const result = buildAgreementSchedule({ ...base, agreedAmount: 600_000 });
    assert.equal(result.principalBalance, 600_000);
    assert.equal(result.forgivenPrincipal, 300_000);
    assert.deepEqual(result.installments.map((i) => [i.installmentNumber, i.dueDate, i.principalDue, i.interestDue]), [
      [5, '2026-11-30', 200_000, 0],
      [6, '2026-12-30', 200_000, 0],
      [7, '2027-01-30', 200_000, 0],
    ]);
  });

  it('agreeing more than the balance: the excess is interest, nothing is forgiven', () => {
    const result = buildAgreementSchedule({ ...base, agreedAmount: 1_050_000 });
    assert.equal(result.forgivenPrincipal, 0);
    assert.deepEqual(result.installments.map((i) => [i.principalDue, i.interestDue, i.amountDue]), [
      [300_000, 50_000, 350_000],
      [300_000, 50_000, 350_000],
      [300_000, 50_000, 350_000],
    ]);
  });

  it('biweekly agreements every 15 days; rounding remainder in the last one', () => {
    const result = buildAgreementSchedule({ ...base, agreedAmount: 100_000, frequency: 'biweekly', firstDueDate: '2026-11-20' });
    assert.deepEqual(result.installments.map((i) => i.dueDate), ['2026-11-20', '2026-12-05', '2026-12-20']);
    assert.deepEqual(result.installments.map((i) => i.principalDue), [33_333, 33_333, 33_334]);
  });

  it('February: a monthly agreement on the 31st falls on the last day', () => {
    const result = buildAgreementSchedule({ ...base, agreedAmount: 300_000, firstDueDate: '2027-01-31' });
    assert.deepEqual(result.installments.map((i) => i.dueDate), ['2027-01-31', '2027-02-28', '2027-03-31']);
  });
});

describe('WriteOffService', () => {
  let state;
  let service;

  beforeEach(() => {
    state = {
      client: { id: 1, writtenOffAt: null },
      loans: [
        { id: 10, clientId: 1, status: 'active', principalBalance: 900_000 },
        { id: 11, clientId: 1, status: 'defaulted', principalBalance: 200_000 },
      ],
      installments: [{ id: 100, loanId: 10, installmentNumber: 4, status: 'pending' }],
      created: [],
      renegotiations: [],
    };
    const loan = (id) => state.loans.find((row) => row.id === id);
    service = new WriteOffService({
      clientRepository: {
        findByIdForUpdate: async (id) => (id === 1 ? state.client : undefined),
        update: async (id, data) => Object.assign(state.client, data),
        findWrittenOff: async () => (state.client.writtenOffAt ? [state.client] : []),
      },
      loanRepository: {
        findOpenByDebtor: async () => state.loans.filter((row) => ['active', 'defaulted'].includes(row.status)),
        update: async (id, data) => Object.assign(loan(id), data),
        findById: async (id) => loan(id),
        findWrittenOffByClients: async () => state.loans.filter((row) => row.status === 'written_off').map((row) => ({ ...row, amountOwed: row.principalBalance })),
        countWrittenOffByClient: async () => state.loans.filter((row) => row.status === 'written_off').length,
      },
      loanInstallmentRepository: {
        findByLoanId: async (loanId) => state.installments.filter((row) => row.loanId === loanId),
        cancelOpenByLoanId: async (loanId) => state.installments.filter((row) => row.loanId === loanId).forEach((row) => Object.assign(row, { status: 'cancelled' })),
        createMany: async (loanId, rows) => state.created.push(...rows),
      },
      loanRenegotiationRepository: { create: async (data) => state.renegotiations.push(data) },
      loanService: { getById: async (id) => loan(id) },
      transactionManager: { run: (work) => work('trx') },
      clock: { today: () => '2026-11-09' },
      roundingUnitCents: ONE_PESO,
    });
  });

  it('writing a client off takes ALL their open loans out of collection', async () => {
    const result = await service.writeOffClient(1, { reason: 'Se fue del país' }, { userId: 7 });
    assert.ok(state.loans.every((row) => row.status === 'written_off'));
    assert.equal(state.client.writeOffReason, 'Se fue del país');
    assert.equal(result.principalLost, 1_100_000);
  });

  it('cannot write off twice, nor a client without open loans', async () => {
    await service.writeOffClient(1, { reason: 'Quebró' });
    await assert.rejects(service.writeOffClient(1, { reason: 'Otra vez' }), ConflictError);
    state.client.writtenOffAt = null;
    await assert.rejects(service.writeOffClient(1, { reason: 'Sin créditos' }), /no tiene créditos abiertos/);
  });

  it('an agreement brings the loan back, forgives the difference and records it', async () => {
    await service.writeOffClient(1, { reason: 'Quebró' });
    await service.renegotiate(10, { agreedAmount: 600_000, numberOfInstallments: 3, frequency: 'monthly', firstDueDate: '2026-11-30' }, { userId: 7 });
    const loan = state.loans[0];
    assert.equal(loan.status, 'active');
    assert.equal(loan.principalBalance, 600_000);
    assert.ok(loan.renegotiatedAt);
    assert.equal(state.installments[0].status, 'cancelled');
    assert.deepEqual(state.created.map((row) => row.installmentNumber), [5, 6, 7]);
    assert.equal(state.renegotiations[0].forgivenPrincipal, 300_000);
    // The other loan is still written off, so the client stays written off.
    assert.ok(state.client.writtenOffAt);
  });

  it('negotiating the last written-off loan clears the client', async () => {
    await service.writeOffClient(1, { reason: 'Quebró' });
    const agreement = { agreedAmount: 100_000, numberOfInstallments: 1, frequency: 'monthly', firstDueDate: '2026-11-30' };
    await service.renegotiate(10, agreement);
    await service.renegotiate(11, agreement);
    assert.equal(state.client.writtenOffAt, null);
  });

  it('only written-off loans can be negotiated, and not with a past first date', async () => {
    const agreement = { agreedAmount: 100_000, numberOfInstallments: 1, frequency: 'monthly', firstDueDate: '2026-11-30' };
    await assert.rejects(service.renegotiate(10, agreement), ConflictError);
    await assert.rejects(service.renegotiate(10, { ...agreement, firstDueDate: '2026-11-01' }), ValidationError);
  });
});
