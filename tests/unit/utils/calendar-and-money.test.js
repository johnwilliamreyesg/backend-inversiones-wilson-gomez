const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { dateInMonth, addMonths, addDays, daysBetween } = require('../../../src/utils/calendar-dates');
const { toCents, fromCents, roundCents } = require('../../../src/utils/money');

describe('calendar-dates', () => {
  it('clamps a day to the end of shorter months', () => {
    assert.equal(dateInMonth(2027, 2, 31), '2027-02-28');
    assert.equal(dateInMonth(2028, 2, 31), '2028-02-29');
    assert.equal(dateInMonth(2026, 11, 31), '2026-11-30');
  });

  it('adds months across years', () => {
    assert.deepEqual(addMonths(2026, 11, 3), { year: 2027, month: 2 });
    assert.deepEqual(addMonths(2026, 12, 1), { year: 2027, month: 1 });
  });

  it('adds days and counts days across months and years', () => {
    assert.equal(addDays('2026-12-25', 15), '2027-01-09');
    assert.equal(daysBetween('2026-12-25', '2027-01-09'), 15);
    assert.equal(daysBetween('2026-10-31', '2026-10-30'), -1);
  });
});

describe('money', () => {
  it('converts without floating point drift', () => {
    assert.equal(toCents(0.1) + toCents(0.2), toCents(0.3));
    assert.equal(fromCents(toCents(32000.5)), 32000.5);
  });

  it('rounds to a unit, to nearest or down', () => {
    // $123.756,70 to $1.000 (100.000 cents)
    assert.equal(roundCents(123_756_70, 100_000), 124_000_00);
    assert.equal(roundCents(123_756_70, 100_000, 'down'), 123_000_00);
  });
});
