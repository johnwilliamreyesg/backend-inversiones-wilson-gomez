const { ValidationError } = require('../errors/app-error');
const { daysBetween, parse, format } = require('../utils/calendar-dates');
const { toCents, fromCents } = require('../utils/money');

const MAX_DAILY_RANGE_DAYS = 366;

const MONEY_FIELDS = ['interestCollected', 'principalCollected', 'disbursed', 'expenses'];
const COUNT_FIELDS = ['paymentsCount', 'loansCreated'];

const sumField = (rows, field) => fromCents(rows.reduce((total, row) => total + toCents(row[field]), 0));
const percentage = (part, whole) => (whole > 0 ? Math.round((part / whole) * 10000) / 100 : null);

/**
 * The quote's reports. Adds the derived figures (total collected, net profit,
 * effectiveness %) and the totals row; the sums come from ReportRepository.
 *
 * netProfit = interest collected - expenses (the principal that comes back
 * is the lender's own money returning, not profit).
 */
class ReportService {
  constructor({ reportRepository, clock }) {
    this.reportRepository = reportRepository;
    this.clock = clock;
  }

  /** Daily profit, disbursements and principal collected. Default: this month up to today. */
  async daily({ from, to }) {
    const today = this.clock.today();
    const end = to ?? today;
    const { year, month } = parse(end);
    const start = from ?? format(year, month, 1);
    if (daysBetween(start, end) >= MAX_DAILY_RANGE_DAYS) {
      throw new ValidationError(`El rango máximo es de ${MAX_DAILY_RANGE_DAYS} días.`, [
        { location: 'query', field: 'from', message: `El rango máximo es de ${MAX_DAILY_RANGE_DAYS} días.` },
      ]);
    }

    const rows = (await this.reportRepository.daily({ from: start, to: end })).map((row) => this.withDerived(row));
    return { from: start, to: end, rows, totals: this.totals(rows) };
  }

  /** Monthly consolidated report with collection effectiveness. Default: current year. */
  async monthly({ year }) {
    const reportYear = year ?? parse(this.clock.today()).year;
    const rows = (await this.reportRepository.monthly({ year: reportYear })).map((row) => ({
      ...this.withDerived(row),
      effectiveness: percentage(row.amountCollectedOnDue, row.amountDue),
    }));

    const totals = this.totals(rows);
    totals.installmentsDue = rows.reduce((total, row) => total + row.installmentsDue, 0);
    totals.amountDue = sumField(rows, 'amountDue');
    totals.amountCollectedOnDue = sumField(rows, 'amountCollectedOnDue');
    totals.effectiveness = percentage(totals.amountCollectedOnDue, totals.amountDue);
    return { year: reportYear, rows, totals };
  }

  async portfolio() {
    const date = this.clock.today();
    return { date, ...(await this.reportRepository.portfolio({ date })) };
  }

  withDerived(row) {
    return {
      ...row,
      totalCollected: fromCents(toCents(row.interestCollected) + toCents(row.principalCollected)),
      netProfit: fromCents(toCents(row.interestCollected) - toCents(row.expenses)),
    };
  }

  totals(rows) {
    const totals = {};
    for (const field of MONEY_FIELDS) totals[field] = sumField(rows, field);
    for (const field of COUNT_FIELDS) totals[field] = rows.reduce((total, row) => total + row[field], 0);
    return this.withDerived(totals);
  }
}

module.exports = { ReportService };
