class RoleRepository {
  constructor({ db }) {
    this.db = db;
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
}

module.exports = { RoleRepository };
