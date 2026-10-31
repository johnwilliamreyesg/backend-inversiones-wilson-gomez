const { NotFoundError, ConflictError, ValidationError } = require('../errors/app-error');
const { USERS_MANAGE_PERMISSION, ADMIN_ROLE_NAME } = require('../security/access-control');

// Roles and the permissions each one grants. Changes apply on the next
// request of every affected user (authenticate reloads permissions each time).
class RoleService {
  constructor({ roleRepository, permissionRepository, managerSafeguard }) {
    this.roleRepository = roleRepository;
    this.permissionRepository = permissionRepository;
    this.managerSafeguard = managerSafeguard;
  }

  list() {
    return this.roleRepository.findAllWithDetails();
  }

  listPermissions() {
    return this.permissionRepository.findAll();
  }

  async getById(id) {
    const role = await this.roleRepository.findById(id);
    if (!role) throw new NotFoundError('El rol no existe.');
    return role;
  }

  async create({ name, description, permissions }) {
    await this.ensureNameIsAvailable(name);
    const permissionIds = await this.resolvePermissionIds(permissions);
    return this.roleRepository.create({ name, description, permissionIds });
  }

  async update(id, { permissions, ...data }) {
    const role = await this.getEditable(id);
    if (data.name) await this.ensureNameIsAvailable(data.name, { excludeId: id });

    const changes = { ...data };
    if (permissions) {
      changes.permissionIds = await this.resolvePermissionIds(permissions);
      const removesManage =
        role.permissions.includes(USERS_MANAGE_PERMISSION) &&
        !permissions.includes(USERS_MANAGE_PERMISSION);
      if (removesManage) {
        await this.managerSafeguard.ensureAnotherManagerRemains({ excludeRoleId: id });
      }
    }
    return this.roleRepository.update(id, changes);
  }

  async delete(id) {
    const role = await this.getEditable(id);
    // Includes inactive users: they keep their role and could be reactivated.
    if (role.userCount > 0) {
      throw new ConflictError(
        `No se puede eliminar: ${role.userCount} usuario(s) tienen el rol "${role.name}". Cámbielos de rol primero.`,
      );
    }
    await this.roleRepository.delete(id);
  }

  /** The seeded admin role is read-only: it must always keep every permission. */
  async getEditable(id) {
    const role = await this.getById(id);
    if (role.name === ADMIN_ROLE_NAME) {
      throw new ConflictError('El rol administrador del sistema no se puede modificar ni eliminar.');
    }
    return role;
  }

  async resolvePermissionIds(codes) {
    const found = await this.permissionRepository.findByCodes(codes);
    const known = new Set(found.map(({ code }) => code));
    const unknown = codes.filter((code) => !known.has(code));
    if (unknown.length > 0) {
      const message = `Permisos que no existen: ${unknown.join(', ')}.`;
      throw new ValidationError(message, [{ location: 'body', field: 'permissions', message }]);
    }
    return found.map(({ id }) => id);
  }

  async ensureNameIsAvailable(name, { excludeId } = {}) {
    const existing = await this.roleRepository.findByName(name, { excludeId });
    if (existing) {
      throw new ConflictError(`Ya existe el rol "${existing.name}".`, {
        field: 'name',
        roleId: existing.id,
      });
    }
  }
}

module.exports = { RoleService };
