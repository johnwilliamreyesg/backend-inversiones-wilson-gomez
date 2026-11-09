const PDFDocument = require('pdfkit');

const PAGE = { size: 'LETTER', layout: 'landscape', margin: 36 };
const INK = '#0a0a0a';
const MUTED = '#64748b';
const RULE = '#cbd5e1';
const OVERDUE = '#b91c1c';

const money = (amount) => `$ ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(amount)}`;
const longDate = (isoDate) =>
  new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T12:00:00Z`),
  );
// "15 sep 2026", the same short date the app shows.
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const shortDate = (isoDate) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
};
const installmentsLabel = (row) =>
  row.firstInstallmentNumber === row.lastInstallmentNumber ? `#${row.firstInstallmentNumber}` : `#${row.firstInstallmentNumber} a #${row.lastInstallmentNumber}`;

// Table columns (width in points). "Cobrado" and "Observaciones" stay empty
// for the collector to fill in by hand.
const COLUMNS = [
  { header: 'Cliente / celular', width: 150 },
  { header: 'Dirección / codeudor', width: 175 },
  { header: 'Crédito', width: 48 },
  { header: 'Cuotas', width: 58 },
  { header: 'Atraso', width: 58 },
  { header: 'Por cobrar', width: 72, align: 'right' },
  { header: 'Cobrado', width: 72 },
  { header: 'Observaciones', width: 87 },
];

/**
 * "Cobros del día" as a printable PDF (letter, landscape): who to collect from,
 * how to reach them, how much, and blank columns to write what was collected.
 * `collections` is CollectionService.listDue's result. Resolves to a Buffer.
 */
const buildCollectionsPdf = ({ collections, generatedAt, timeZone }) =>
  new Promise((resolve, reject) => {
    const { items, meta } = collections;
    const doc = new PDFDocument({ ...PAGE, bufferPages: true, info: { Title: `Cobros del día ${meta.date}`, Author: 'Inversiones Wilson Gómez' } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const bottom = doc.page.height - doc.page.margins.bottom - 18;

    // Header
    doc.fillColor(INK).font('Helvetica').fontSize(9).text('INVERSIONES', left, 36, { characterSpacing: 3 });
    doc.font('Helvetica-Bold').fontSize(18).text('Wilson Gómez', left, 48);
    doc.font('Helvetica-Bold').fontSize(14).text('Cobros del día', left, 36, { align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(longDate(meta.date), left, 54, { align: 'right' });
    doc
      .fontSize(8)
      .text(`Generado el ${new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short', timeZone }).format(generatedAt)}`, left, 68, { align: 'right' });

    // Summary
    const overdue = items.filter((row) => row.isOverdue).length;
    doc.fillColor(INK).font('Helvetica').fontSize(10);
    doc.text(
      `${items.length} crédito(s) por cobrar · ${overdue} atrasado(s) · Total por cobrar: ${money(meta.amountDue)}`,
      left,
      92,
    );

    let y = 112;
    const drawHeader = () => {
      doc.rect(left, y, right - left, 18).fill(INK);
      let x = left;
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
      for (const column of COLUMNS) {
        doc.text(column.header, x + 4, y + 5, { width: column.width - 8, align: column.align ?? 'left' });
        x += column.width;
      }
      y += 18;
    };
    drawHeader();

    if (items.length === 0) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('No hay cobros pendientes para esta fecha.', left, y + 12);
    }

    items.forEach((row, index) => {
      const cells = [
        { lines: [{ text: row.clientName, bold: true }, { text: `${row.clientPhoneCountryCode ?? ''} ${row.clientPhoneNumber ?? ''}`.trim(), muted: true }] },
        {
          lines: [
            { text: row.clientAddress || 'Sin dirección', muted: !row.clientAddress },
            row.coDebtorName && { text: `Codeudor: ${row.coDebtorName} ${row.coDebtorPhoneNumber ?? ''}`.trim(), muted: true },
          ].filter(Boolean),
        },
        { lines: [{ text: `#${row.loanId}` }] },
        { lines: [{ text: installmentsLabel(row) }, { text: `desde ${shortDate(row.oldestDueDate)}`, muted: true }] },
        { lines: [{ text: row.isOverdue ? `${row.daysOverdue} día(s)` : 'Vence hoy', overdue: row.isOverdue }] },
        { lines: [{ text: money(row.amountDue), bold: true }], align: 'right' },
        { lines: [] },
        { lines: [] },
      ];

      // Row height: the tallest cell.
      doc.fontSize(8.5);
      const heights = cells.map((cell, i) =>
        cell.lines.reduce((h, line) => h + doc.heightOfString(line.text, { width: COLUMNS[i].width - 8 }) + 1, 0),
      );
      const rowHeight = Math.max(30, ...heights.map((h) => h + 10));

      if (y + rowHeight > bottom) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeader();
      }
      if (index % 2 === 1) doc.rect(left, y, right - left, rowHeight).fill('#f1f5f9');

      let x = left;
      cells.forEach((cell, i) => {
        let lineY = y + 5;
        for (const line of cell.lines) {
          doc
            .fillColor(line.overdue ? OVERDUE : line.muted ? MUTED : INK)
            .font(line.bold ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(8.5)
            .text(line.text, x + 4, lineY, { width: COLUMNS[i].width - 8, align: cell.align ?? 'left' });
          lineY = doc.y + 1;
        }
        x += COLUMNS[i].width;
      });
      // Boxes to write in.
      const writeX = left + COLUMNS.slice(0, 6).reduce((sum, column) => sum + column.width, 0);
      doc.lineWidth(0.5).strokeColor(RULE).rect(writeX + 4, y + 4, COLUMNS[6].width - 8, rowHeight - 8).stroke();
      doc.rect(writeX + COLUMNS[6].width + 4, y + 4, COLUMNS[7].width - 8, rowHeight - 8).stroke();
      doc.moveTo(left, y + rowHeight).lineTo(right, y + rowHeight).stroke();
      y += rowHeight;
    });

    // Totals and page numbers
    if (items.length > 0) {
      if (y + 40 > bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(`Total por cobrar: ${money(meta.amountDue)}`, left, y + 10, { width: right - left, align: 'right' });
      doc.font('Helvetica').fontSize(10).text('Total cobrado: ______________________', left, y + 26, { width: right - left, align: 'right' });
    }
    const range = doc.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page += 1) {
      doc.switchToPage(page);
      // The footer sits below the bottom margin: without this pdfkit would start a new page.
      doc.page.margins.bottom = 0;
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(8)
        .text(`Inversiones Wilson Gómez · Cobros del ${shortDate(meta.date)} · Página ${page + 1} de ${range.count}`, left, doc.page.height - 30, {
          width: right - left,
          align: 'center',
          lineBreak: false,
        });
    }
    doc.end();
  });

module.exports = { buildCollectionsPdf };
