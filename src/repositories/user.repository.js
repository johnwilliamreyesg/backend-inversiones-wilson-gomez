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
];

class UserRepository {
  constructor({ db }) {
    this.db = db;
  }

  withRole() {
    return this.db(TABLE_NAME).join('roles', 'roles.id', 'users.roleId');
  }

  findById(id) {
    return this.withRole().where('users.id', id).first(PUBLIC_COLUMNS);
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
