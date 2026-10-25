const { NotFoundError, ConflictError } = require('../errors/app-error');

// Business rules for clients. Knows nothing about HTTP or SQL: it receives
// already-validated data and talks to the database only through repositories.
class ClientService {
  constructor({ clientRepository, loanRepository }) {
    this.clientRepository = clientRepository;
    this.loanRepository = loanRepository;
  }

  async list({ search, page, pageSize }) {
    const { items, total } = await this.clientRepository.findAll({ search, page, pageSize });
    return {
      items,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id) {
    const client = await this.clientRepository.findById(id);
    if (!client) throw new NotFoundError('El cliente no existe.');
    return client;
  }

  async create(data, { userId = null } = {}) {
    await this.ensureNationalIdIsAvailable(data.nationalId);
    return this.clientRepository.create({ ...data, createdBy: userId });
  }

  async update(id, data) {
    await this.getById(id);
    if (data.nationalId) {
      await this.ensureNationalIdIsAvailable(data.nationalId, { excludeId: id });
    }
    return this.clientRepository.update(id, data);
  }

  async delete(id) {
    await this.getById(id);

    const openLoans = await this.loanRepository.countOpenByClientId(id);
    if (openLoans > 0) {
      throw new ConflictError(
        `No se puede eliminar: el cliente tiene ${openLoans} crédito(s) abierto(s) como deudor o codeudor.`,
      );
    }

    await this.clientRepository.softDelete(id);
  }

  async ensureNationalIdIsAvailable(nationalId, { excludeId } = {}) {
    const existing = await this.clientRepository.findByNationalId(nationalId, { excludeId });
    if (existing) {
      throw new ConflictError(
        `Ya existe un cliente con la cédula ${nationalId}: ${existing.fullName}.`,
        { field: 'nationalId', clientId: existing.id },
      );
    }
  }
}

module.exports = { ClientService };
