const { UnauthorizedError, ValidationError } = require('../errors/app-error');

// Same message for "unknown email" and "wrong password", so the login form
// cannot be used to discover which emails are registered.
const INVALID_CREDENTIALS_MESSAGE = 'Correo o contraseña incorrectos.';
const INACTIVE_USER_MESSAGE = 'El usuario está inactivo. Contacte al administrador.';

// Real bcrypt hash of a random string. Comparing against it when the email does
// not exist makes both failure paths take the same time (no timing leak).
const DUMMY_PASSWORD_HASH = '$2b$12$bzziwRapZzkdOhqi4EMrie5WBdUrDpeHp0qLc622aobq5VLwCj6Uy';

class AuthService {
  constructor({ userRepository, roleRepository, passwordHasher, tokenProvider }) {
    this.userRepository = userRepository;
    this.roleRepository = roleRepository;
    this.passwordHasher = passwordHasher;
    this.tokenProvider = tokenProvider;
  }

  /** Returns { token, user } for valid credentials. */
  async login({ email, password }) {
    const credentials = await this.userRepository.findCredentialsByEmail(email);
    const passwordMatches = await this.passwordHasher.compare(
      password,
      credentials?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!credentials || !passwordMatches) {
      throw new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE);
    }
    if (!credentials.isActive) {
      throw new UnauthorizedError(INACTIVE_USER_MESSAGE);
    }

    await this.userRepository.updateLastLogin(credentials.id);

    return {
      token: this.tokenProvider.sign({
        userId: credentials.id,
        tokenVersion: credentials.tokenVersion,
      }),
      user: await this.getProfile(credentials.id),
    };
  }

  /**
   * Turns a bearer token into the current user (with permissions).
   * Runs on every protected request, so deactivating a user, changing a
   * password or editing a role's permissions takes effect immediately.
   */
  async resolveUser(token) {
    const { userId, tokenVersion } = this.tokenProvider.verify(token);
    const credentials = await this.userRepository.findCredentialsById(userId);

    if (!credentials || credentials.tokenVersion !== tokenVersion) {
      throw new UnauthorizedError('La sesión no es válida. Inicie sesión de nuevo.');
    }
    if (!credentials.isActive) {
      throw new UnauthorizedError(INACTIVE_USER_MESSAGE);
    }

    return this.getProfile(userId);
  }

  async getProfile(userId) {
    const user = await this.userRepository.findById(userId);
    const permissions = await this.roleRepository.findPermissionCodes(user.roleId);
    return { ...user, permissions };
  }

  /**
   * Changes the password and returns a fresh token: this device stays logged
   * in, every other session (e.g. a lost phone) is closed.
   */
  async changePassword(userId, { currentPassword, newPassword }) {
    const credentials = await this.userRepository.findCredentialsById(userId);

    const currentMatches = await this.passwordHasher.compare(
      currentPassword,
      credentials.passwordHash,
    );
    if (!currentMatches) {
      throw new ValidationError('La contraseña actual no es correcta.', [
        { location: 'body', field: 'currentPassword', message: 'La contraseña actual no es correcta.' },
      ]);
    }
    if (currentPassword === newPassword) {
      throw new ValidationError('La nueva contraseña debe ser diferente a la actual.', [
        { location: 'body', field: 'newPassword', message: 'Debe ser diferente a la actual.' },
      ]);
    }

    const newHash = await this.passwordHasher.hash(newPassword);
    const tokenVersion = await this.userRepository.updatePassword(userId, newHash);

    return { token: this.tokenProvider.sign({ userId, tokenVersion }) };
  }
}

module.exports = { AuthService };
