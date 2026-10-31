const { NotFoundError, ConflictError, ValidationError } = require('../errors/app-error');
const { USERS_MANAGE_PERMISSION } = require('../security/access-control');

// User administration (done by someone with users.manage). Logging in and
// changing one's own password stay in AuthService.
class UserService {
  constructor({ userRepository, roleRepository, passwordHasher, managerSafeguard }) {
    this.userRepository = userRepository;
    this.roleRepository = roleRepository;
    this.passwordHasher = passwordHasher;
    this.managerSafeguard = managerSafeguard;
  }

  async list({ search, roleId, isActive, page, pageSize }) {
    const { items, total } = await this.userRepository.findAll({
      search,
      roleId,
      isActive,
      page,
      pageSize,
    });
    return {
      items,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id) {
    const user = await this.userRepository.findById(id);
    if (!user) throw new NotFoundError('El usuario no existe.');
    return user;
  }

  async create({ password, ...data }) {
    await this.ensureEmailIsAvailable(data.email);
    await this.ensureRoleExists(data.roleId);

    const passwordHash = await this.passwordHasher.hash(password);
    return this.userRepository.create({ ...data, passwordHash });
  }

  /** `actorId` is the logged-in user making the change. */
  async update(id, data, { actorId }) {
    const user = await this.getById(id);
    const isSelf = id === actorId;

    if (isSelf && data.isActive === false) {
      throw this.fieldError('isActive', 'No puede desactivar su propio usuario.');
    }
    if (isSelf && data.roleId !== undefined && data.roleId !== user.roleId) {
      throw this.fieldError('roleId', 'No puede cambiar su propio rol.');
    }
    if (data.email) await this.ensureEmailIsAvailable(data.email, { excludeId: id });
    if (data.roleId) await this.ensureRoleExists(data.roleId);

    if (await this.losesManageAccess(user, data)) {
      await this.managerSafeguard.ensureAnotherManagerRemains({ excludeUserId: id });
    }

    // Deactivating closes the user's open sessions right away; without this,
    // reactivating them later would revive old, still-unexpired tokens.
    const revokeSessions = user.isActive && data.isActive === false;
    return this.userRepository.update(id, data, { revokeSessions });
  }

  /** Sets a new password for another user and closes all their sessions. */
  async resetPassword(id, { newPassword }, { actorId }) {
    if (id === actorId) {
      throw this.fieldError(
        'newPassword',
        'Para su propia contraseña use "Cambiar contraseña" (pide la contraseña actual).',
      );
    }
    await this.getById(id);
    const passwordHash = await this.passwordHasher.hash(newPassword);
    await this.userRepository.updatePassword(id, passwordHash);
  }

  /** True when the change takes users.manage away from an active user. */
  async losesManageAccess(user, data) {
    if (!user.isActive) return false;
    const hasIt = async (roleId) =>
      (await this.roleRepository.findPermissionCodes(roleId)).includes(USERS_MANAGE_PERMISSION);

    if (!(await hasIt(user.roleId))) return false;
    if (data.isActive === false) return true;
    return data.roleId !== undefined && data.roleId !== user.roleId && !(await hasIt(data.roleId));
  }

  async ensureEmailIsAvailable(email, { excludeId } = {}) {
    const existing = await this.userRepository.findByEmail(email, { excludeId });
    if (existing) {
      throw new ConflictError(`Ya existe un usuario con el correo ${email}: ${existing.fullName}.`, {
        field: 'email',
        userId: existing.id,
      });
    }
  }

  async ensureRoleExists(roleId) {
    const role = await this.roleRepository.findById(roleId);
    if (!role) throw this.fieldError('roleId', 'El rol no existe.');
  }

  fieldError(field, message) {
    return new ValidationError(message, [{ location: 'body', field, message }]);
  }
}

module.exports = { UserService };
