const { ConflictError } = require('../errors/app-error');
const { USERS_MANAGE_PERMISSION } = require('../security/access-control');

/**
 * Prevents the system from being left without anyone able to manage users.
 * Shared by UserService (deactivating / changing a role) and RoleService
 * (removing users.manage from a role), so the rule lives in one place.
 */
class ManagerSafeguard {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  /** Throws unless an active manager remains after ignoring the given user or role. */
  async ensureAnotherManagerRemains({ excludeUserId, excludeRoleId } = {}) {
    const remaining = await this.userRepository.countActiveWithPermission(USERS_MANAGE_PERMISSION, {
      excludeUserId,
      excludeRoleId,
    });
    if (remaining === 0) {
      throw new ConflictError(
        'No es posible: el sistema quedaría sin ningún usuario activo que pueda administrar usuarios.',
      );
    }
  }
}

module.exports = { ManagerSafeguard };
