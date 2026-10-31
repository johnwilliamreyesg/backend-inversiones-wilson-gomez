// Permissions are a fixed catalog defined by the seed (the code checks them
// by code), so this repository only reads.
class PermissionRepository {
  constructor({ db }) {
    this.db = db;
  }

  findAll() {
    return this.db('permissions').select('id', 'code', 'description').orderBy('code');
  }

  findByCodes(codes) {
    return this.db('permissions').whereIn('code', codes).select('id', 'code');
  }
}

module.exports = { PermissionRepository };
