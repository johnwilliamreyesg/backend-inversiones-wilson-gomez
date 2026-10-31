// Pure calendar math on 'YYYY-MM-DD' strings (the format of DATE columns).
// Uses UTC internally so no time zone can shift a date by one day.

const parse = (isoDate) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return { year, month, day };
};

const format = (year, month, day) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Day `day` of the given month, moved back to the last day if the month is shorter (31 -> 30, 28). */
const dateInMonth = (year, month, day) => format(year, month, Math.min(day, daysInMonth(year, month)));

/** Same month arithmetic as a calendar: addMonths(2026, 11, 3) -> { year: 2027, month: 2 }. */
const addMonths = (year, month, count) => {
  const index = year * 12 + (month - 1) + count;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};

const addDays = (isoDate, count) => {
  const { year, month, day } = parse(isoDate);
  const date = new Date(Date.UTC(year, month - 1, day + count));
  return format(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
};

/** Whole days from `from` to `to` (negative if `to` is earlier). */
const daysBetween = (from, to) => {
  const toUtc = (isoDate) => {
    const { year, month, day } = parse(isoDate);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
};

module.exports = { parse, format, daysInMonth, dateInMonth, addMonths, addDays, daysBetween };
