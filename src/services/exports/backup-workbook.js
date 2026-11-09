const ExcelJS = require('exceljs');

// Spanish labels for the codes stored in the database.
const LOAN_STATUS = { active: 'Activo', paid_off: 'Pagado', defaulted: 'En mora', cancelled: 'Cancelado', written_off: 'Castigado' };
const INSTALLMENT_STATUS = { pending: 'Pendiente', partially_paid: 'Abonada', paid: 'Pagada', cancelled: 'Cancelada' };
const FREQUENCY = { monthly: 'Mensual', biweekly: 'Quincenal' };
const PAYMENT_METHOD = { cash: 'Efectivo', transfer: 'Transferencia' };
const PAYMENT_TYPE = { installment: 'Cuota', interest_only: 'Solo intereses', principal: 'Abono a capital' };

const MONEY_FORMAT = '#,##0';
const DATE_FORMAT = 'dd/mm/yyyy';
const DATETIME_FORMAT = 'dd/mm/yyyy hh:mm';

/** 'YYYY-MM-DD' → a Date Excel shows as that same calendar day. */
const calendarDate = (isoDate) => {
  if (!isoDate) return null;
  const [year, month, day] = String(isoDate).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};
const yesNo = (value) => (value ? 'Sí' : 'No');

// Column kinds: how each value is converted and formatted.
const money = (header, key, width = 15) => ({ header, key, width, kind: 'money' });
const date = (header, key, width = 13) => ({ header, key, width, kind: 'date' });
const datetime = (header, key, width = 17) => ({ header, key, width, kind: 'datetime' });
const text = (header, key, width = 18, map) => ({ header, key, width, kind: 'text', map });

const SHEETS = [
  {
    name: 'Clientes',
    source: 'clients',
    columns: [
      text('ID', 'id', 7),
      text('Nombre', 'fullName', 32),
      text('Cédula', 'nationalId', 15),
      text('Indicativo', 'phoneCountryCode', 10),
      text('Celular', 'phoneNumber', 14),
      text('Dirección', 'address', 36),
      text('Notas', 'notes', 30),
      text('Castigado', 'writtenOffAt', 10, yesNo),
      datetime('Castigado el', 'writtenOffAt'),
      text('Castigado por', 'writtenOffByName', 20),
      text('Motivo del castigo', 'writeOffReason', 30),
      datetime('Registrado', 'createdAt'),
      datetime('Eliminado', 'deletedAt'),
    ],
  },
  {
    name: 'Créditos',
    source: 'loans',
    columns: [
      text('ID', 'id', 7),
      text('Cliente', 'clientName', 30),
      text('Cédula cliente', 'clientNationalId', 15),
      text('Codeudor', 'coDebtorName', 28),
      text('Frecuencia', 'frequency', 11, (value) => FREQUENCY[value] ?? value),
      text('Estado', 'status', 11, (value) => LOAN_STATUS[value] ?? value),
      money('Monto prestado', 'principalAmount'),
      { header: 'Tasa mensual %', key: 'monthlyInterestRate', width: 13, kind: 'number' },
      money('Cuota pactada (antiguos)', 'installmentAmount', 17),
      { header: 'N.º cuotas', key: 'numberOfInstallments', width: 10, kind: 'number' },
      { header: 'Día de cobro', key: 'paymentDay', width: 11, kind: 'number' },
      { header: '2.º día de cobro', key: 'secondPaymentDay', width: 13, kind: 'number' },
      date('Desembolso', 'startDate'),
      money('Saldo de capital', 'principalBalance'),
      datetime('Castigado el', 'writtenOffAt'),
      datetime('Renegociado el', 'renegotiatedAt'),
      text('Notas', 'notes', 30),
      datetime('Registrado', 'createdAt'),
    ],
  },
  {
    name: 'Cuotas',
    source: 'installments',
    columns: [
      text('Crédito', 'loanId', 8),
      text('Cuota', 'installmentNumber', 7),
      date('Vence', 'dueDate'),
      money('Capital', 'principalDue'),
      money('Interés', 'interestDue'),
      money('Valor cuota', 'amountDue'),
      money('Capital pagado', 'principalPaid'),
      money('Interés pagado', 'interestPaid'),
      text('Estado', 'status', 11, (value) => INSTALLMENT_STATUS[value] ?? value),
      datetime('Pagada el', 'paidAt'),
    ],
  },
  {
    name: 'Pagos',
    source: 'payments',
    columns: [
      text('ID', 'id', 7),
      text('Crédito', 'loanId', 8),
      text('Cliente', 'clientName', 30),
      date('Fecha', 'paymentDate'),
      money('Valor', 'amount'),
      money('Capital', 'principalAmount'),
      money('Interés', 'interestAmount'),
      text('Medio', 'paymentMethod', 13, (value) => PAYMENT_METHOD[value] ?? value),
      text('Tipo', 'paymentType', 15, (value) => PAYMENT_TYPE[value] ?? value),
      text('Recibió', 'receivedByName', 20),
      text('Anulado', 'voidedAt', 9, yesNo),
      text('Motivo anulación', 'voidReason', 28),
      text('Notas', 'notes', 30),
    ],
  },
  {
    name: 'Gastos',
    source: 'expenses',
    columns: [
      text('ID', 'id', 7),
      date('Fecha', 'expenseDate'),
      text('Categoría', 'categoryName', 18),
      money('Valor', 'amount'),
      text('Descripción', 'description', 40),
      text('Registró', 'createdByName', 20),
      text('Eliminado', 'deletedAt', 10, yesNo),
    ],
  },
  {
    name: 'Acuerdos de pago',
    source: 'renegotiations',
    columns: [
      text('Crédito', 'loanId', 8),
      text('Cliente', 'clientName', 30),
      datetime('Fecha del acuerdo', 'createdAt'),
      money('Saldo que debía', 'previousBalance'),
      money('Valor acordado', 'agreedAmount'),
      money('Capital perdonado', 'forgivenPrincipal'),
      text('Frecuencia', 'frequency', 11, (value) => FREQUENCY[value] ?? value),
      { header: 'N.º cuotas', key: 'numberOfInstallments', width: 10, kind: 'number' },
      date('Primera cuota', 'firstDueDate'),
      text('Registró', 'createdByName', 20),
      text('Notas', 'notes', 30),
    ],
  },
];

const cellValue = (column, row) => {
  const value = row[column.key];
  if (column.map) return column.map(value);
  if (value === null || value === undefined) return null;
  if (column.kind === 'money' || column.kind === 'number') return Number(value);
  if (column.kind === 'date') return calendarDate(value);
  if (column.kind === 'datetime') return new Date(value);
  return value;
};

const styleHeader = (sheet) => {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A0A0A' } };
  header.alignment = { vertical: 'middle' };
  header.height = 20;
};

/**
 * Builds the backup workbook: a summary plus one sheet per table, with
 * Spanish headers, real numbers and dates, filters and a frozen header.
 * `data` = { clients, loans, installments, payments, expenses, renegotiations }.
 */
const buildBackupWorkbook = async ({ data, generatedAt, generatedBy, timeZone }) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Inversiones Wilson Gómez';
  workbook.created = generatedAt;

  const summary = workbook.addWorksheet('Resumen');
  summary.columns = [{ width: 28 }, { width: 40 }];
  summary.addRow(['Copia de seguridad', 'Inversiones Wilson Gómez']).font = { bold: true, size: 14 };
  summary.addRow(['Generada', new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone }).format(generatedAt)]);
  summary.addRow(['Por', generatedBy ?? '—']);
  summary.addRow([]);
  for (const { name, source } of SHEETS) summary.addRow([name, `${data[source].length} registro(s)`]);

  for (const { name, source, columns } of SHEETS) {
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    // Rows by position: two columns may read the same field (e.g. "Castigado" and "Castigado el").
    sheet.columns = columns.map(({ header, width }) => ({ header, width }));
    for (const row of data[source]) sheet.addRow(columns.map((column) => cellValue(column, row)));
    columns.forEach((column, index) => {
      const numFmt = { money: MONEY_FORMAT, date: DATE_FORMAT, datetime: DATETIME_FORMAT }[column.kind];
      if (numFmt && !column.map) sheet.getColumn(index + 1).numFmt = numFmt;
    });
    styleHeader(sheet);
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }

  return workbook.xlsx.writeBuffer();
};

module.exports = { buildBackupWorkbook, SHEETS };
