const TABLE_NAME = 'roles';

class RoleRepository {
  constructor({ db }) {
    this.db = db;
  }

  /**
   * Roles with their permission codes and how many users have them,
   * in one query: [{ id, name, description, permissions: [...], userCount }].
   */
  findAllWithDetails() {
    return this.db(TABLE_NAME)
      .select(
        'roles.id',
        'roles.name',
        'roles.description',
        'roles.createdAt',
        'roles.updatedAt',
        this.db.raw(
          `COALESCE(
             (SELECT array_agg(p.code ORDER BY p.code)
                FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
               WHERE rp.role_id = roles.id),
             '{}') AS permissions`,
        ),
        this.db.raw('(SELECT COUNT(*) FROM users u WHERE u.role_id = roles.id)::int AS user_count'),
      )
      .orderBy('roles.name');
  }

  async findById(id) {
    const [role] = await this.findAllWithDetails().where('roles.id', id);
    return role;
  }

  /** Case-insensitive, so "Cobrador" and "cobrador" are the same role. */
  findByName(name, { excludeId } = {}) {
    const query = this.db(TABLE_NAME).whereRaw('LOWER(??) = LOWER(?)', ['name', name]);
    if (excludeId) query.whereNot({ id: excludeId });
    return query.first('id', 'name');
  }

  /** Permission codes granted to a role, e.g. ['clients.read', 'clients.create']. */
  async findPermissionCodes(roleId) {
    const rows = await this.db('rolePermissions')
      .join('permissions', 'permissions.id', 'rolePermissions.permissionId')
      .where('rolePermissions.roleId', roleId)
      .orderBy('permissions.code')
      .select('permissions.code');
    return rows.map(({ code }) => code);
  }

  /** Creates the role and its permissions in one transaction. */
  async create({ name, description, permissionIds }) {
    const id = await this.db.transaction(async (trx) => {
      const [role] = await trx(TABLE_NAME).insert({ name, description }).returning('id');
      await this.insertPermissions(trx, role.id, permissionIds);
      return role.id;
    });
    return this.findById(id);
  }

  /**
   * Updates name/description and, when `permissionIds` is given, replaces the
   * whole permission set. All or nothing.
   */
  async update(id, { permissionIds, ...data }) {
    await this.db.transaction(async (trx) => {
      if (Object.keys(data).length > 0) {
        await trx(TABLE_NAME).where({ id }).update(data);
      }
      if (permissionIds) {
        await trx('rolePermissions').where({ roleId: id }).delete();
        await this.insertPermissions(trx, id, permissionIds);
      }
    });
    return this.findById(id);
  }

  /** role_permissions rows are removed by ON DELETE CASCADE. */
  async delete(id) {
    await this.db(TABLE_NAME).where({ id }).delete();
  }

  async insertPermissions(trx, roleId, permissionIds) {
    if (permissionIds.length === 0) return;
    await trx('rolePermissions').insert(
      permissionIds.map((permissionId) => ({ roleId, permissionId })),
    );
  }
}

module.exports = { RoleRepository };
