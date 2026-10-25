const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { AuthService } = require('../../../src/services/auth.service');
const { UnauthorizedError, ValidationError } = require('../../../src/errors/app-error');

// Fakes: plain-text "hashes" and readable tokens keep the tests fast and obvious.
const createFakePasswordHasher = () => ({
  comparedHashes: [],
  async hash(plain) {
    return `hashed:${plain}`;
  },
  async compare(plain, hash) {
    this.comparedHashes.push(hash);
    return hash === `hashed:${plain}`;
  },
});

const fakeTokenProvider = {
  sign: ({ userId, tokenVersion }) => `token:${userId}:${tokenVersion}`,
  verify(token) {
    const [prefix, userId, tokenVersion] = token.split(':');
    if (prefix !== 'token') throw new UnauthorizedError('La sesión no es válida.');
    return { userId: Number(userId), tokenVersion: Number(tokenVersion) };
  },
};

const createFakeUserRepository = (users) => ({
  users,
  async findCredentialsByEmail(email) {
    return this.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  },
  async findCredentialsById(id) {
    return this.users.find((user) => user.id === id);
  },
  async findById(id) {
    const { passwordHash, tokenVersion, ...profile } = this.users.find((user) => user.id === id);
    return profile;
  },
  async updateLastLogin(id) {
    this.users.find((user) => user.id === id).lastLoginAt = 'now';
  },
  async updatePassword(id, passwordHash) {
    const user = this.users.find((row) => row.id === id);
    user.passwordHash = passwordHash;
    user.tokenVersion += 1;
    return user.tokenVersion;
  },
});

const fakeRoleRepository = {
  async findPermissionCodes() {
    return ['clients.read', 'clients.create'];
  },
};

const buildAdmin = (overrides = {}) => ({
  id: 1,
  fullName: 'Admin',
  email: 'admin@test.com',
  passwordHash: 'hashed:secret123',
  isActive: true,
  tokenVersion: 0,
  roleId: 1,
  roleName: 'admin',
  ...overrides,
});

describe('AuthService', () => {
  let userRepository;
  let passwordHasher;
  let service;

  const buildService = (users) => {
    userRepository = createFakeUserRepository(users);
    passwordHasher = createFakePasswordHasher();
    service = new AuthService({
      userRepository,
      roleRepository: fakeRoleRepository,
      passwordHasher,
      tokenProvider: fakeTokenProvider,
    });
  };

  beforeEach(() => buildService([buildAdmin()]));

  describe('login', () => {
    it('returns a token and the profile with permissions, without secrets', async () => {
      const { token, user } = await service.login({ email: 'admin@test.com', password: 'secret123' });

      assert.equal(token, 'token:1:0');
      assert.deepEqual(user.permissions, ['clients.read', 'clients.create']);
      assert.equal(user.passwordHash, undefined);
      assert.equal(user.tokenVersion, undefined);
      assert.equal(userRepository.users[0].lastLoginAt, 'now');
    });

    it('rejects a wrong password with the generic message', async () => {
      await assert.rejects(
        service.login({ email: 'admin@test.com', password: 'nope' }),
        (error) => error instanceof UnauthorizedError && error.message === 'Correo o contraseña incorrectos.',
      );
    });

    it('rejects an unknown email with the SAME message and still runs a hash comparison', async () => {
      await assert.rejects(
        service.login({ email: 'ghost@test.com', password: 'x' }),
        (error) => error.message === 'Correo o contraseña incorrectos.',
      );
      assert.equal(passwordHasher.comparedHashes.length, 1, 'must compare against the dummy hash');
    });

    it('rejects an inactive user', async () => {
      buildService([buildAdmin({ isActive: false })]);
      await assert.rejects(
        service.login({ email: 'admin@test.com', password: 'secret123' }),
        /inactivo/,
      );
    });
  });

  describe('resolveUser', () => {
    it('returns the user for a valid token', async () => {
      const user = await service.resolveUser('token:1:0');
      assert.equal(user.email, 'admin@test.com');
      assert.ok(user.permissions.includes('clients.read'));
    });

    it('rejects a token from an older token version (e.g. after a password change)', async () => {
      buildService([buildAdmin({ tokenVersion: 3 })]);
      await assert.rejects(service.resolveUser('token:1:2'), UnauthorizedError);
    });

    it('rejects a token of a user deactivated after logging in', async () => {
      buildService([buildAdmin({ isActive: false })]);
      await assert.rejects(service.resolveUser('token:1:0'), /inactivo/);
    });

    it('rejects a token of a user that no longer exists', async () => {
      await assert.rejects(service.resolveUser('token:99:0'), UnauthorizedError);
    });
  });

  describe('changePassword', () => {
    it('saves the new hash and returns a token with the next version', async () => {
      const { token } = await service.changePassword(1, {
        currentPassword: 'secret123',
        newPassword: 'newSecret456',
      });

      assert.equal(token, 'token:1:1');
      assert.equal(userRepository.users[0].passwordHash, 'hashed:newSecret456');
      await assert.rejects(service.resolveUser('token:1:0'), UnauthorizedError, 'old token must die');
    });

    it('rejects a wrong current password', async () => {
      await assert.rejects(
        service.changePassword(1, { currentPassword: 'bad', newPassword: 'newSecret456' }),
        ValidationError,
      );
    });

    it('rejects reusing the current password', async () => {
      await assert.rejects(
        service.changePassword(1, { currentPassword: 'secret123', newPassword: 'secret123' }),
        /diferente/,
      );
    });
  });
});
