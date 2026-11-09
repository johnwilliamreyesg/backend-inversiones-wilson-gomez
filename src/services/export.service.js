const { buildBackupWorkbook } = require('./exports/backup-workbook');
const { buildCollectionsPdf } = require('./exports/collections-pdf');

/** Files to download: the Excel backup and the printable collections list. */
class ExportService {
  constructor({ backupRepository, collectionService, clock, timeZone }) {
    this.backupRepository = backupRepository;
    this.collectionService = collectionService;
    this.clock = clock;
    this.timeZone = timeZone;
  }

  async backup({ generatedBy }) {
    const [clients, loans, installments, payments, expenses, renegotiations] = await Promise.all([
      this.backupRepository.clients(),
      this.backupRepository.loans(),
      this.backupRepository.installments(),
      this.backupRepository.payments(),
      this.backupRepository.expenses(),
      this.backupRepository.renegotiations(),
    ]);
    const buffer = await buildBackupWorkbook({
      data: { clients, loans, installments, payments, expenses, renegotiations },
      generatedAt: new Date(),
      generatedBy,
      timeZone: this.timeZone,
    });
    return { buffer, filename: `backup-inversiones-wilson-gomez-${this.clock.today()}.xlsx` };
  }

  /** Same filters as the collections screen (date, search, onlyOverdue...). */
  async collectionsPdf(query) {
    const collections = await this.collectionService.listDue(query);
    const buffer = await buildCollectionsPdf({ collections, generatedAt: new Date(), timeZone: this.timeZone });
    return { buffer, filename: `cobros-${collections.meta.date}.pdf` };
  }
}

module.exports = { ExportService };
