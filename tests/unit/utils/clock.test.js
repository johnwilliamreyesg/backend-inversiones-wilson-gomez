const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Clock } = require('../../../src/utils/clock');

describe('Clock', () => {
  it("uses the client's time zone, not the server's", () => {
    // 2026-11-01 03:00 UTC is still 2026-10-31 at 22:00 in Bogotá (UTC-5).
    const now = () => new Date('2026-11-01T03:00:00Z');
    assert.equal(new Clock({ timeZone: 'America/Bogota', now }).today(), '2026-10-31');
    assert.equal(new Clock({ timeZone: 'UTC', now }).today(), '2026-11-01');
  });
});
