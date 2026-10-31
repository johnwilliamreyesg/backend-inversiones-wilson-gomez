// Business calendar: "today" in the client's time zone as 'YYYY-MM-DD',
// the same format the database uses for DATE columns.
// Injected into services so tests can fix the date.
class Clock {
  constructor({ timeZone, now = () => new Date() }) {
    // 'en-CA' formats dates as YYYY-MM-DD.
    this.formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    this.now = now;
  }

  today() {
    return this.formatter.format(this.now());
  }
}

module.exports = { Clock };
