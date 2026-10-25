const db = require('./config/database');
const env = require('./config/env');
const { PasswordHasher } = require('./security/password-hasher');
const { TokenProvider } = require('./security/token-provider');
const { HealthRepository } = require('./repositories/health.repository');
const { ClientRepository } = require('./repositories/client.repository');
const { LoanRepository } = require('./repositories/loan.repository');
const { UserRepository } = require('./repositories/user.repository');
const { RoleRepository } = require('./repositories/role.repository');
const { HealthService } = require('./services/health.service');
const { ClientService } = require('./services/client.service');
const { AuthService } = require('./services/auth.service');
const { HealthController } = require('./controllers/health.controller');
const { ClientController } = require('./controllers/client.controller');
const { AuthController } = require('./controllers/auth.controller');
const { createAuthenticate } = require('./middlewares/authenticate');

/**
 * Composition root: the ONLY place where classes are instantiated and wired.
 * Every class receives its dependencies through the constructor (Dependency
 * Inversion), so no service or controller ever does `require` of a database
 * or of another layer's instance.
 *
 * Adding a module = create its repository -> service -> controller here.
 */
const createContainer = () => {
  // Security
  const passwordHasher = new PasswordHasher();
  const tokenProvider = new TokenProvider({
    secret: env.auth.jwtSecret,
    expiresIn: env.auth.jwtExpiresIn,
  });

  // Repositories
  const healthRepository = new HealthRepository({ db });
  const clientRepository = new ClientRepository({ db });
  const loanRepository = new LoanRepository({ db });
  const userRepository = new UserRepository({ db });
  const roleRepository = new RoleRepository({ db });

  // Services
  const healthService = new HealthService({ healthRepository });
  const clientService = new ClientService({ clientRepository, loanRepository });
  const authService = new AuthService({
    userRepository,
    roleRepository,
    passwordHasher,
    tokenProvider,
  });

  // Controllers
  const healthController = new HealthController({ healthService });
  const clientController = new ClientController({ clientService });
  const authController = new AuthController({ authService });

  // Middlewares that need services
  const authenticate = createAuthenticate({ authService });

  return {
    db,
    controllers: { healthController, clientController, authController },
    middlewares: { authenticate },
  };
};

module.exports = { createContainer };
