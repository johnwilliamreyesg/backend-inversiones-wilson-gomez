const { daysBetween, addDays } = require('../utils/calendar-dates');
const { toCents, fromCents } = require('../utils/money');

/**
 * "Cobros del día": every open loan with installments due today or overdue,
 * ready for the collector's phone (call button, address, amount to collect).
 */
class CollectionService {
  constructor({ loanInstallmentRepository, paymentRepository, scheduleKeeper, clock }) {
    this.loanInstallmentRepository = loanInstallmentRepository;
    this.paymentRepository = paymentRepository;
    this.scheduleKeeper = scheduleKeeper;
    this.clock = clock;
  }

  async listDue({ date: requestedDate, frequency, search, onlyOverdue }) {
    const date = requestedDate ?? this.clock.today();
    // Open-ended loans only get new installments over time: make sure they exist.
    await this.scheduleKeeper.keepAllCurrent();

    const rows = await this.loanInstallmentRepository.findDueByLoan({ date, frequency, search });
    const items = rows
      .map((row) => {
        const daysOverdue = Math.max(0, daysBetween(row.oldestDueDate, date));
        return { ...row, amountDue: Number(row.amountDue), daysOverdue, isOverdue: daysOverdue > 0 };
      })
      .filter((item) => !onlyOverdue || item.isOverdue);

    const { totals: collected } = await this.paymentRepository.findAll({ from: date, to: date, page: 1, pageSize: 1 });
    return {
      items,
      meta: {
        date,
        loans: items.length,
        overdueLoans: items.filter(({ isOverdue }) => isOverdue).length,
        amountDue: fromCents(items.reduce((total, item) => total + toCents(item.amountDue), 0)),
        collected,
      },
    };
  }

  /** Installments due in the next `days` days, to remind the clients beforehand. */
  async listUpcoming({ days }) {
    const today = this.clock.today();
    await this.scheduleKeeper.keepAllCurrent();
    const from = addDays(today, 1);
    const to = addDays(today, days);
    const rows = await this.loanInstallmentRepository.findUpcoming({ from, to });
    const items = rows.map((row) => ({ ...row, amountDue: Number(row.amountDue), daysUntilDue: daysBetween(today, row.dueDate) }));
    return { items, meta: { from, to, installments: items.length } };
  }
}

module.exports = { CollectionService };
