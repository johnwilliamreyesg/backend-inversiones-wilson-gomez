const TABLE_NAME = 'users';

// Safe to send to the client: never includes password_hash or token_version.
const PUBLIC_COLUMNS = [
  'users.id',
  'users.fullName',
  'users.email',
  'users.isActive',
  'users.lastLoginAt',
  'users.roleId',
  'roles.name as roleName',
  'users.createdAt',
  'users.updatedAt',
];

class UserRepository {
  constructor({ db }) {
    this.db = db;
  }

  withRole() {
    return this.db(TABLE_NAME).join('roles', 'roles.id', 'users.roleId');
  }

  /** Paginated list ordered by name. Returns { items, total }. */
  async findAll({ search, roleId, isActive, page, pageSize }) {
    const query = this.withRole();
    if (roleId) query.where('users.roleId', roleId);
    if (isActive !== undefined) query.where('users.isActive', isActive);
    if (search) {
      // Escape LIKE wildcards so "%" or "_" typed by the user match literally.
      const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      query.where((builder) =>
        builder
          .whereRaw('unaccent(??) ILIKE unaccent(?)', ['users.fullName', pattern])
          .orWhereILike('users.email', pattern),
      );
    }

    const [{ total }] = await query.clone().count({ total: '*' });
    const items = await query
      .select(PUBLIC_COLUMNS)
      .orderBy([{ column: 'users.fullName' }, { column: 'users.id' }])
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { items, total: Number(total) };
  }

  findById(id) {
    return this.withRole().where('users.id', id).first(PUBLIC_COLUMNS);
  }

  /** Case-insensitive, like the unique index on LOWER(email). */
  findByEmail(email, { excludeId } = {}) {
    const query = this.withRole().whereRaw('LOWER(??) = LOWER(?)', ['users.email', email]);
    if (excludeId) query.whereNot('users.id', excludeId);
    return query.first(PUBLIC_COLUMNS);
  }

  async create(data) {
    const [{ id }] = await this.db(TABLE_NAME).insert(data).returning('id');
    return this.findById(id);
  }

  /**
   * Updates profile fields. `revokeSessions: true` also bumps token_version,
   * so every token issued before stops working (used on deactivation).
   */
  async update(id, data, { revokeSessions = false } = {}) {
    const changes = { ...data };
    if (revokeSessions) changes.tokenVersion = this.db.raw('?? + 1', ['tokenVersion']);
    await this.db(TABLE_NAME).where({ id }).update(changes);
    return this.findById(id);
  }

  /**
   * Active users whose role grants `permissionCode`, optionally ignoring one
   * user or every user of one role (to simulate a change before making it).
   */
  async countActiveWithPermission(permissionCode, { excludeUserId, excludeRoleId } = {}) {
    const query = this.db(TABLE_NAME)
      .join('rolePermissions', 'rolePermissions.roleId', 'users.roleId')
      .join('permissions', 'permissions.id', 'rolePermissions.permissionId')
      .where({ 'users.isActive': true, 'permissions.code': permissionCode });
    if (excludeUserId) query.whereNot('users.id', excludeUserId);
    if (excludeRoleId) query.whereNot('users.roleId', excludeRoleId);

    const [{ total }] = await query.count({ total: '*' });
    return Number(total);
  }

  /**
   * For authentication only: includes the credentials needed to verify a
   * login or a token. Never return this object in an HTTP response.
   */
  findCredentialsByEmail(email) {
    return this.db(TABLE_NAME)
      .whereRaw('LOWER(??) = LOWER(?)', ['email', email])
      .first('id', 'passwordHash', 'isActive', 'tokenVersion');
  }

  findCredentialsById(id) {
    return this.db(TABLE_NAME).where({ id }).first('id', 'passwordHash', 'isActive', 'tokenVersion');
  }

  async updateLastLogin(id) {
    await this.db(TABLE_NAME).where({ id }).update({ lastLoginAt: this.db.fn.now() });
  }

  /** Saves the new hash and bumps token_version, invalidating all previous tokens. */
  async updatePassword(id, passwordHash) {
    const [{ tokenVersion }] = await this.db(TABLE_NAME)
      .where({ id })
      .update({ passwordHash, tokenVersion: this.db.raw('?? + 1', ['tokenVersion']) })
      .returning('tokenVersion');
    return tokenVersion;
  }
}

module.exports = { UserRepository };
