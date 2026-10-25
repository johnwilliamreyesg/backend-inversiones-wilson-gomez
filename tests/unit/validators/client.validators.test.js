const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createClientSchema,
  updateClientSchema,
  listClientsQuerySchema,
} = require('../../../src/validators/client.validators');

const VALID_CLIENT = {
  fullName: '  Ana Pérez  ',
  nationalId: 'ab-1234',
  phoneNumber: '300 123-4567',
};

const fieldsWithErrors = (result) => result.error.issues.map((issue) => issue.path.join('.'));

describe('createClientSchema', () => {
  it('normalizes input: trims name, uppercases ID, keeps only phone digits, defaults +57', () => {
    const result = createClientSchema.parse({ ...VALID_CLIENT, address: '   ' });
    assert.deepEqual(result, {
      fullName: 'Ana Pérez',
      nationalId: 'AB-1234',
      phoneCountryCode: '+57',
      phoneNumber: '3001234567',
      address: null,
      notes: null,
    });
  });

  it('reports every invalid field at once', () => {
    const result = createClientSchema.safeParse({
      fullName: 'A',
      nationalId: 'x',
      phoneCountryCode: '57',
      phoneNumber: '12',
    });
    assert.deepEqual(fieldsWithErrors(result).sort(), [
      'fullName',
      'nationalId',
      'phoneCountryCode',
      'phoneNumber',
    ]);
  });

  it('requires name, national ID and phone', () => {
    const result = createClientSchema.safeParse({});
    assert.deepEqual(fieldsWithErrors(result).sort(), ['fullName', 'nationalId', 'phoneNumber']);
  });
});

describe('updateClientSchema', () => {
  it('accepts a single field and does not invent the others', () => {
    assert.deepEqual(updateClientSchema.parse({ notes: 'Paga los viernes' }), {
      notes: 'Paga los viernes',
    });
  });

  it('allows clearing an optional field', () => {
    assert.deepEqual(updateClientSchema.parse({ address: '' }), { address: null });
  });

  it('rejects an empty body', () => {
    assert.equal(updateClientSchema.safeParse({}).success, false);
  });
});

describe('listClientsQuerySchema', () => {
  it('applies pagination defaults and converts strings to numbers', () => {
    assert.deepEqual(listClientsQuerySchema.parse({ page: '2' }), { page: 2, pageSize: 20 });
  });

  it('caps the page size at 100', () => {
    assert.equal(listClientsQuerySchema.safeParse({ pageSize: '500' }).success, false);
  });
});
