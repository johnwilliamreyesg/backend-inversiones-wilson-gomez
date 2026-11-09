const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { buildBackupWorkbook } = require('../../../src/services/exports/backup-workbook');
const { buildCollectionsPdf } = require('../../../src/services/exports/collections-pdf');

const data = {
  clients: [
    { id: 1, fullName: 'Ana Pérez', nationalId: '100', phoneCountryCode: '+57', phoneNumber: '3001112233', writtenOffAt: '2026-11-01T15:00:00Z', writeOffReason: 'Se fue del país', createdAt: '2026-10-01T12:00:00Z' },
  ],
  loans: [
    { id: 7, clientName: 'Ana Pérez', frequency: 'biweekly', status: 'written_off', principalAmount: 1_000_000, monthlyInterestRate: 10, numberOfInstallments: 4, paymentDay: 15, secondPaymentDay: 30, startDate: '2026-10-05', principalBalance: 750_000, createdAt: '2026-10-05T12:00:00Z' },
  ],
  installments: [{ loanId: 7, installmentNumber: 1, dueDate: '2026-10-15', principalDue: 250_000, interestDue: 50_000, amountDue: 300_000, principalPaid: 250_000, interestPaid: 50_000, status: 'paid' }],
  payments: [{ id: 3, loanId: 7, clientName: 'Ana Pérez', paymentDate: '2026-10-15', amount: 300_000, principalAmount: 250_000, interestAmount: 50_000, paymentMethod: 'cash', paymentType: 'installment', voidedAt: null }],
  expenses: [],
  renegotiations: [],
};

describe('buildBackupWorkbook', () => {
  it('one sheet per table plus a summary, Spanish headers, real numbers and dates', async () => {
    const buffer = await buildBackupWorkbook({ data, generatedAt: new Date('2026-11-09T15:00:00Z'), generatedBy: 'Wilson', timeZone: 'America/Bogota' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Resumen', 'Clientes', 'Créditos', 'Cuotas', 'Pagos', 'Gastos', 'Acuerdos de pago']);

    const loans = workbook.getWorksheet('Créditos');
    const headers = loans.getRow(1).values.slice(1);
    const value = (header) => loans.getRow(2).getCell(headers.indexOf(header) + 1).value;
    assert.equal(value('Estado'), 'Castigado');
    assert.equal(value('Frecuencia'), 'Quincenal');
    assert.equal(value('Monto prestado'), 1_000_000);
    assert.equal(value('2.º día de cobro'), 30);
    assert.equal(value('Desembolso').toISOString().slice(0, 10), '2026-10-05');

    // Two columns read the same field: "Castigado" (Sí/No) and "Castigado el" (date).
    const clients = workbook.getWorksheet('Clientes');
    const clientHeaders = clients.getRow(1).values.slice(1);
    assert.equal(clients.getRow(2).getCell(clientHeaders.indexOf('Castigado') + 1).value, 'Sí');
    assert.ok(clients.getRow(2).getCell(clientHeaders.indexOf('Castigado el') + 1).value instanceof Date);

    assert.match(workbook.getWorksheet('Resumen').getRow(5).getCell(2).value, /1 registro/);
  });
});

describe('buildCollectionsPdf', () => {
  const row = (n) => ({
    loanId: n,
    clientName: `Cliente número ${n}`,
    clientPhoneCountryCode: '+57',
    clientPhoneNumber: '3001112233',
    clientAddress: 'Carrera 45 # 123-67, barrio San Antonio de Prado',
    coDebtorName: n % 2 ? 'Luis Gómez' : null,
    installmentsDue: 2,
    firstInstallmentNumber: 2,
    lastInstallmentNumber: 3,
    oldestDueDate: '2026-10-23',
    amountDue: 360_000,
    daysOverdue: 17,
    isOverdue: true,
  });

  it('is a PDF, and many collections continue on more pages', async () => {
    const one = await buildCollectionsPdf({ collections: { items: [row(1)], meta: { date: '2026-11-09', amountDue: 360_000 } }, generatedAt: new Date(), timeZone: 'America/Bogota' });
    assert.equal(one.subarray(0, 5).toString(), '%PDF-');
    assert.equal((one.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length, 1);

    const many = await buildCollectionsPdf({
      collections: { items: Array.from({ length: 40 }, (_, i) => row(i + 1)), meta: { date: '2026-11-09', amountDue: 14_400_000 } },
      generatedAt: new Date(),
      timeZone: 'America/Bogota',
    });
    assert.ok((many.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length > 1);
  });

  it('works with nothing to collect', async () => {
    const empty = await buildCollectionsPdf({ collections: { items: [], meta: { date: '2026-11-09', amountDue: 0 } }, generatedAt: new Date(), timeZone: 'America/Bogota' });
    assert.equal(empty.subarray(0, 5).toString(), '%PDF-');
  });
});
