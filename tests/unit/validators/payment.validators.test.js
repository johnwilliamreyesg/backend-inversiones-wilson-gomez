const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { registerPaymentSchema } = require('../../../src/validators/payment.validators');

const fieldsWithErrors = (result) => result.error.issues.map((issue) => issue.path.join('.'));

describe('registerPaymentSchema', () => {
  it('defaults to a regular installment payment in cash', () => {
    const { data } = registerPaymentSchema.safeParse({ amount: 50_000 });
    assert.equal(data.paymentType, 'installment');
    assert.equal(data.paymentMethod, 'cash');
    assert.equal(data.recalculation, undefined);
  });

  it('accepts interest only and a principal prepayment with its recalculation', () => {
    assert.equal(registerPaymentSchema.safeParse({ amount: 1, paymentType: 'interest_only' }).success, true);
    const prepayment = { amount: 1, paymentType: 'principal', recalculation: 'reduce_term' };
    assert.equal(registerPaymentSchema.safeParse(prepayment).success, true);
  });

  it('rejects an unknown type or recalculation', () => {
    assert.deepEqual(fieldsWithErrors(registerPaymentSchema.safeParse({ amount: 1, paymentType: 'gift' })), ['paymentType']);
    const result = registerPaymentSchema.safeParse({ amount: 1, paymentType: 'principal', recalculation: 'never' });
    assert.deepEqual(fieldsWithErrors(result), ['recalculation']);
  });

  it('rescheduling what is left only goes with an interest-only payment', () => {
    const ok = registerPaymentSchema.safeParse({ amount: 1, paymentType: 'interest_only', rescheduleTo: '2026-11-30' });
    assert.equal(ok.success, true);
    const wrongType = registerPaymentSchema.safeParse({ amount: 1, rescheduleTo: '2026-11-30' });
    assert.deepEqual(fieldsWithErrors(wrongType), ['rescheduleTo']);
    const badDate = registerPaymentSchema.safeParse({ amount: 1, paymentType: 'interest_only', rescheduleTo: '30/11/2026' });
    assert.deepEqual(fieldsWithErrors(badDate), ['rescheduleTo']);
  });

  it('a recalculation only makes sense with a principal prepayment', () => {
    const result = registerPaymentSchema.safeParse({ amount: 1, recalculation: 'reduce_installment' });
    assert.deepEqual(fieldsWithErrors(result), ['recalculation']);
  });
});
