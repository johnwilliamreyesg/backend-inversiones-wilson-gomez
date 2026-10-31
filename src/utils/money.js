// Money math in integer cents: 0.1 + 0.2 !== 0.3 in floating point, but
// 10 + 20 === 30 always. Convert at the edges, compute in cents.

const toCents = (amount) => Math.round(amount * 100);
const fromCents = (cents) => cents / 100;

/** Rounds cents to a multiple of `unitCents` (e.g. 100 = whole pesos). */
const roundCents = (cents, unitCents, mode = 'nearest') => {
  const units = cents / unitCents;
  const rounded = mode === 'down' ? Math.floor(units) : Math.round(units);
  return rounded * unitCents;
};

module.exports = { toCents, fromCents, roundCents };
