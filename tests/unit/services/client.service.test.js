const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ClientService } = require('../../../src/services/client.service');
const { NotFoundError, ConflictError } = require('../../../src/errors/app-error');

// In-memory fakes: the service cannot tell them apart from the real
// repositories, which is exactly what constructor injection allows.
const createFakeClientRepository = (clients = []) => ({
  rows: [...clients],
  async findAll({ page, pageSize }) {
    const start = (page - 1) * pageSize;
    return { items: this.rows.slice(start, start + pageSize), total: this.rows.length };
  },
  async findById(id) {
    return this.rows.find((client) => client.id === id);
  },
  async findByNationalId(nationalId, { excludeId } = {}) {
    return this.rows.find((client) => client.nationalId === nationalId && client.id !== excludeId);
  },
  async create(data) {
    const client = { id: this.rows.length + 1, ...data };
    this.rows.push(client);
    return client;
  },
  async update(id, data) {
    const client = this.rows.find((row) => row.id === id);
    return Object.assign(client, data);
  },
  async softDelete(id) {
    this.rows = this.rows.filter((client) => client.id !== id);
    return true;
  },
});

const createFakeLoanRepository = (openLoansByClient = {}) => ({
  async countOpenByClientId(clientId) {
    return openLoansByClient[clientId] ?? 0;
  },
});

const ANA = { id: 1, fullName: 'Ana Pérez', nationalId: '100' };
const LUIS = { id: 2, fullName: 'Luis Gómez', nationalId: '200' };

describe('ClientService', () => {
  let clientRepository;
  let service;

  beforeEach(() => {
    clientRepository = createFakeClientRepository([ANA, LUIS]);
    service = new ClientService({ clientRepository, loanRepository: createFakeLoanRepository() });
  });

  describe('list', () => {
    it('returns items with pagination metadata', async () => {
      const result = await service.list({ page: 1, pageSize: 1 });
      assert.equal(result.items.length, 1);
      assert.deepEqual(result.meta, { page: 1, pageSize: 1, total: 2, totalPages: 2 });
    });
  });

  describe('getById', () => {
    it('returns the client when it exists', async () => {
      assert.equal((await service.getById(1)).fullName, 'Ana Pérez');
    });

    it('throws NotFoundError when it does not exist', async () => {
      await assert.rejects(service.getById(99), NotFoundError);
    });
  });

  describe('create', () => {
    it('stores the client with the user who created it', async () => {
      const client = await service.create({ fullName: 'Marta', nationalId: '300' }, { userId: 7 });
      assert.equal(client.createdBy, 7);
    });

    it('rejects a national ID that already belongs to another client', async () => {
      await assert.rejects(service.create({ fullName: 'Otra', nationalId: '100' }), (error) => {
        assert.ok(error instanceof ConflictError);
        assert.match(error.message, /Ana Pérez/);
        return true;
      });
    });
  });

  describe('update', () => {
    it('allows keeping the same national ID', async () => {
      const client = await service.update(1, { nationalId: '100', fullName: 'Ana P.' });
      assert.equal(client.fullName, 'Ana P.');
    });

    it("rejects changing to another client's national ID", async () => {
      await assert.rejects(service.update(1, { nationalId: '200' }), ConflictError);
    });

    it('throws NotFoundError for a missing client', async () => {
      await assert.rejects(service.update(99, { fullName: 'X' }), NotFoundError);
    });
  });

  describe('delete', () => {
    it('deletes a client without open loans', async () => {
      await service.delete(2);
      await assert.rejects(service.getById(2), NotFoundError);
    });

    it('refuses to delete a client with open loans (as debtor or co-debtor)', async () => {
      service = new ClientService({
        clientRepository,
        loanRepository: createFakeLoanRepository({ 1: 2 }),
      });
      await assert.rejects(service.delete(1), /2 crédito\(s\) abierto\(s\)/);
    });
  });
});
