const db = require('./config/database');
const env = require('./config/env');
const { PasswordHasher } = require('./security/password-hasher');
const { TokenProvider } = require('./security/token-provider');
const { createFileStorage } = require('./storage/create-file-storage');
const { ImageProcessor } = require('./storage/image-processor');
const { Clock } = require('./utils/clock');
const { HealthRepository } = require('./repositories/health.repository');
const { ClientRepository } = require('./repositories/client.repository');
const { ClientPhotoRepository } = require('./repositories/client-photo.repository');
const { LoanRepository } = require('./repositories/loan.repository');
const { UserRepository } = require('./repositories/user.repository');
const { RoleRepository } = require('./repositories/role.repository');
const { ExpenseRepository } = require('./repositories/expense.repository');
const { ExpenseCategoryRepository } = require('./repositories/expense-category.repository');
const { HealthService } = require('./services/health.service');
const { ClientService } = require('./services/client.service');
const { ClientPhotoService } = require('./services/client-photo.service');
const { AuthService } = require('./services/auth.service');
const { ExpenseService } = require('./services/expense.service');
const { ExpenseCategoryService } = require('./services/expense-category.service');
const { HealthController } = require('./controllers/health.controller');
const { ClientController } = require('./controllers/client.controller');
const { ClientPhotoController } = require('./controllers/client-photo.controller');
const { AuthController } = require('./controllers/auth.controller');
const { FileController } = require('./controllers/file.controller');
const { ExpenseController } = require('./controllers/expense.controller');
const { ExpenseCategoryController } = require('./controllers/expense-category.controller');
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

  // Files
  const fileStorage = createFileStorage({
    storageConfig: env.storage,
    jwtSecret: env.auth.jwtSecret,
  });
  const imageProcessor = new ImageProcessor();

  // Business calendar
  const clock = new Clock({ timeZone: env.timeZone });

  // Repositories
  const healthRepository = new HealthRepository({ db });
  const clientRepository = new ClientRepository({ db });
  const clientPhotoRepository = new ClientPhotoRepository({ db });
  const loanRepository = new LoanRepository({ db });
  const userRepository = new UserRepository({ db });
  const roleRepository = new RoleRepository({ db });
  const expenseRepository = new ExpenseRepository({ db });
  const expenseCategoryRepository = new ExpenseCategoryRepository({ db });

  // Services
  const healthService = new HealthService({ healthRepository });
  const clientService = new ClientService({ clientRepository, loanRepository });
  const clientPhotoService = new ClientPhotoService({
    clientRepository,
    clientPhotoRepository,
    imageProcessor,
    fileStorage,
  });
  const authService = new AuthService({
    userRepository,
    roleRepository,
    passwordHasher,
    tokenProvider,
  });
  const expenseCategoryService = new ExpenseCategoryService({ expenseCategoryRepository });
  const expenseService = new ExpenseService({
    expenseRepository,
    expenseCategoryService,
    clock,
  });

  // Controllers
  const healthController = new HealthController({ healthService });
  const clientController = new ClientController({ clientService });
  const clientPhotoController = new ClientPhotoController({ clientPhotoService });
  const authController = new AuthController({ authService });
  const expenseController = new ExpenseController({ expenseService });
  const expenseCategoryController = new ExpenseCategoryController({ expenseCategoryService });
  // Only the local driver serves files through the API; R2 serves them itself.
  const fileController =
    env.storage.driver === 'local' ? new FileController({ fileStorage }) : null;

  // Middlewares that need services
  const authenticate = createAuthenticate({ authService });

  return {
    db,
    controllers: {
      healthController,
      clientController,
      clientPhotoController,
      authController,
      fileController,
      expenseController,
      expenseCategoryController,
    },
    middlewares: { authenticate },
  };
};

module.exports = { createContainer };
