const TABLE_NAME = 'clients';

// Columns exposed to the rest of the app (internal ones like deleted_at stay hidden).
const PUBLIC_COLUMNS = [
  'id',
  'fullName',
  'nationalId',
  'phoneCountryCode',
  'phoneNumber',
  'address',
  'notes',
  'createdBy',
  'createdAt',
  'updatedAt',
];

// Soft-deleted clients are invisible to every query in this repository.
class ClientRepository {
  constructor({ db }) {
    this.db = db;
  }

  activeClients() {
    return this.db(TABLE_NAME).whereNull('deletedAt');
  }

  /**
   * Paginated list ordered by name. `search` matches name (ignoring case and
   * accents), national ID or phone. Returns { items, total }.
   */
  async findAll({ search, page, pageSize }) {
    const query = this.activeClients();

    if (search) {
      // Escape LIKE wildcards so "%" or "_" typed by the user match literally.
      const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      query.where((builder) =>
        builder
          .whereRaw('unaccent(??) ILIKE unaccent(?)', ['fullName', pattern])
          .orWhereILike('nationalId', pattern)
          .orWhereILike('phoneNumber', pattern),
      );
    }

    const [{ total }] = await query.clone().count({ total: '*' });
    const items = await query
      .select(PUBLIC_COLUMNS)
      .orderBy([{ column: 'fullName' }, { column: 'id' }])
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { items, total: Number(total) };
  }

  findById(id) {
    return this.activeClients().where({ id }).first(PUBLIC_COLUMNS);
  }

  /** Finds an active client with this national ID, optionally ignoring one client (on update). */
  findByNationalId(nationalId, { excludeId } = {}) {
    const query = this.activeClients().where({ nationalId });
    if (excludeId) query.whereNot({ id: excludeId });
    return query.first(PUBLIC_COLUMNS);
  }

  async create(data) {
    const [client] = await this.db(TABLE_NAME).insert(data).returning(PUBLIC_COLUMNS);
    return client;
  }

  async update(id, data) {
    const [client] = await this.activeClients()
      .where({ id })
      .update(data)
      .returning(PUBLIC_COLUMNS);
    return client;
  }

  /** Returns true when a client was deleted, false when it did not exist. */
  async softDelete(id) {
    const deletedRows = await this.activeClients()
      .where({ id })
      .update({ deletedAt: this.db.fn.now() });
    return deletedRows > 0;
  }
}

module.exports = { ClientRepository };
