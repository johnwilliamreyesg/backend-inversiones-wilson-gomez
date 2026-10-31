const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { UserService } = require('../../../src/services/user.service');
const { ManagerSafeguard } = require('../../../src/services/manager-safeguard');
const {
  NotFoundError,
  ConflictError,
  ValidationError,
} = require('../../../src/errors/app-error');

// Role 1 = admin (users.manage), role 2 = collector (no users.manage).
const PERMISSIONS_BY_ROLE = { 1: ['clients.read', 'users.manage'], 2: ['clients.read'] };

const fakeRoleRepository = {
  async findById(id) {
    return PERMISSIONS_BY_ROLE[id] ? { id } : undefined;
  },
  async findPermissionCodes(roleId) {
    return PERMISSIONS_BY_ROLE[roleId] ?? [];
  },
};

const createFakeUserRepository = (users) => ({
  rows: users.map((user) => ({ tokenVersion: 0, ...user })),
  async findById(id) {
    return this.rows.find((user) => user.id === id);
  },
  async findByEmail(email, { excludeId } = {}) {
    return this.rows.find((user) => user.email === email && user.id !== excludeId);
  },
  async create(data) {
    const user = { id: this.rows.length + 1, isActive: true, ...data };
    this.rows.push(user);
    return user;
  },
  async update(id, data, { revokeSessions = false } = {}) {
    const user = await this.findById(id);
    if (revokeSessions) user.tokenVersion += 1;
    return Object.assign(user, data);
  },
  async updatePassword(id, passwordHash) {
    const user = await this.findById(id);
    user.passwordHash = passwordHash;
    user.tokenVersion += 1;
    return user.tokenVersion;
  },
  async countActiveWithPermission(code, { excludeUserId } = {}) {
    return this.rows.filter(
      (user) =>
        user.isActive && user.id !== excludeUserId && PERMISSIONS_BY_ROLE[user.roleId].includes(code),
    ).length;
  },
});

const fakePasswordHasher = { hash: async (plain) => `hashed:${plain}` };

const ADMIN = { id: 1, fullName: 'Admin', email: 'admin@test.com', roleId: 1, isActive: true };
const SECOND_ADMIN = { id: 2, fullName: 'Wilson', email: 'wilson@test.com', roleId: 1, isActive: true };
const COLLECTOR = { id: 3, fullName: 'Cobrador', email: 'cobra@test.com', roleId: 2, isActive: true };

const buildService = (users) => {
  const userRepository = createFakeUserRepository(users);
  const service = new UserService({
    userRepository,
    roleRepository: fakeRoleRepository,
    passwordHasher: fakePasswordHasher,
    managerSafeguard: new ManagerSafeguard({ userRepository }),
  });
  return { service, userRepository };
};

const failsOnField = (field) => (error) =>
  error instanceof ValidationError && error.details[0].field === field;

describe('UserService', () => {
  let service;
  let userRepository;

  beforeEach(() => {
    ({ service, userRepository } = buildService([ADMIN, SECOND_ADMIN, COLLECTOR]));
  });

  describe('create', () => {
    it('stores the hashed password, never the plain one', async () => {
      const user = await service.create({
        fullName: 'Nuevo',
        email: 'nuevo@test.com',
        password: 'Clave123',
        roleId: 2,
      });
      assert.equal(user.passwordHash, 'hashed:Clave123');
      assert.equal('password' in user, false);
    });

    it('rejects a used email (409) and an unknown role (400 on roleId)', async () => {
      await assert.rejects(
        service.create({ fullName: 'X', email: 'admin@test.com', password: 'Clave123', roleId: 2 }),
        ConflictError,
      );
      await assert.rejects(
        service.create({ fullName: 'X', email: 'x@test.com', password: 'Clave123', roleId: 99 }),
        failsOnField('roleId'),
      );
    });
  });

  describe('update', () => {
    it('refuses to deactivate or change the role of oneself', async () => {
      await assert.rejects(service.update(1, { isActive: false }, { actorId: 1 }), failsOnField('isActive'));
      await assert.rejects(service.update(1, { roleId: 2 }, { actorId: 1 }), failsOnField('roleId'));
    });

    it('lets a user edit their own name and keep their role', async () => {
      const user = await service.update(1, { fullName: 'Admin P.', roleId: 1 }, { actorId: 1 });
      assert.equal(user.fullName, 'Admin P.');
    });

    it('deactivating closes the user sessions (token version bumped)', async () => {
      await service.update(3, { isActive: false }, { actorId: 1 });
      assert.equal(userRepository.rows[2].tokenVersion, 1);
    });

    it('allows removing a manager while another active manager remains', async () => {
      await service.update(2, { roleId: 2 }, { actorId: 1 });
      assert.equal(userRepository.rows[1].roleId, 2);
    });

    it('refuses to leave the system without an active manager', async () => {
      // User 1 is the only manager. The actor (99) is not user 1, so the
      // "not yourself" rules do not apply and only the safeguard can stop it.
      ({ service } = buildService([ADMIN, COLLECTOR]));
      await assert.rejects(service.update(1, { isActive: false }, { actorId: 99 }), /sin ningún usuario activo/);
      await assert.rejects(service.update(1, { roleId: 2 }, { actorId: 99 }), ConflictError);
    });

    it('throws NotFoundError for a missing user', async () => {
      await assert.rejects(service.update(99, { fullName: 'X' }, { actorId: 1 }), NotFoundError);
    });
  });

  describe('resetPassword', () => {
    it("sets another user's password and closes their sessions", async () => {
      await service.resetPassword(3, { newPassword: 'Nueva123' }, { actorId: 1 });
      assert.equal(userRepository.rows[2].passwordHash, 'hashed:Nueva123');
      assert.equal(userRepository.rows[2].tokenVersion, 1);
    });

    it('refuses resetting one\'s own password (that requires the current one)', async () => {
      await assert.rejects(
        service.resetPassword(1, { newPassword: 'Nueva123' }, { actorId: 1 }),
        failsOnField('newPassword'),
      );
    });
  });
});
