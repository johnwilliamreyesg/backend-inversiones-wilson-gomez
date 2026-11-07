const db = require('./config/database');
const env = require('./config/env');
const { PasswordHasher } = require('./security/password-hasher');
const { TokenProvider } = require('./security/token-provider');
const { createFileStorage } = require('./storage/create-file-storage');
const { ImageProcessor } = require('./storage/image-processor');
const { Clock } = require('./utils/clock');
const { TransactionManager } = require('./repositories/transaction-manager');
const { HealthRepository } = require('./repositories/health.repository');
const { ClientRepository } = require('./repositories/client.repository');
const { ClientPhotoRepository } = require('./repositories/client-photo.repository');
const { LoanRepository } = require('./repositories/loan.repository');
const { UserRepository } = require('./repositories/user.repository');
const { RoleRepository } = require('./repositories/role.repository');
const { ExpenseRepository } = require('./repositories/expense.repository');
const { ExpenseCategoryRepository } = require('./repositories/expense-category.repository');
const { PermissionRepository } = require('./repositories/permission.repository');
const { LoanInstallmentRepository } = require('./repositories/loan-installment.repository');
const { PaymentRepository } = require('./repositories/payment.repository');
const { PaymentAllocationRepository } = require('./repositories/payment-allocation.repository');
const { PaymentScheduleChangeRepository } = require('./repositories/payment-schedule-change.repository');
const { InstallmentDueDateChangeRepository } = require('./repositories/installment-due-date-change.repository');
const { ReportRepository } = require('./repositories/report.repository');
const { InterestRateRepository } = require('./repositories/interest-rate.repository');
const { HealthService } = require('./services/health.service');
const { ClientService } = require('./services/client.service');
const { ClientPhotoService } = require('./services/client-photo.service');
const { AuthService } = require('./services/auth.service');
const { ExpenseService } = require('./services/expense.service');
const { ExpenseCategoryService } = require('./services/expense-category.service');
const { ManagerSafeguard } = require('./services/manager-safeguard');
const { UserService } = require('./services/user.service');
const { RoleService } = require('./services/role.service');
const { LoanService } = require('./services/loan.service');
const { InterestRateService } = require('./services/interest-rate.service');
const { InstallmentDueDateService } = require('./services/installment-due-date.service');
const { LoanScheduleCalculator } = require('./services/loan-schedules/loan-schedule-calculator');
const { MonthlyScheduleStrategy } = require('./services/loan-schedules/monthly-schedule-strategy');
const { BiweeklyScheduleStrategy } = require('./services/loan-schedules/biweekly-schedule-strategy');
const { LoanScheduleKeeper } = require('./services/loan-schedules/loan-schedule-keeper');
const { PaymentService } = require('./services/payment.service');
const { PaymentAllocator } = require('./services/payments/payment-allocator');
const { InstallmentRescheduler } = require('./services/payments/installment-rescheduler');
const { CollectionService } = require('./services/collection.service');
const { ReportService } = require('./services/report.service');
const { HealthController } = require('./controllers/health.controller');
const { ClientController } = require('./controllers/client.controller');
const { ClientPhotoController } = require('./controllers/client-photo.controller');
const { AuthController } = require('./controllers/auth.controller');
const { FileController } = require('./controllers/file.controller');
const { ExpenseController } = require('./controllers/expense.controller');
const { ExpenseCategoryController } = require('./controllers/expense-category.controller');
const { UserController } = require('./controllers/user.controller');
const { RoleController } = require('./controllers/role.controller');
const { LoanController } = require('./controllers/loan.controller');
const { InterestRateController } = require('./controllers/interest-rate.controller');
const { PaymentController } = require('./controllers/payment.controller');
const { CollectionController } = require('./controllers/collection.controller');
const { ReportController } = require('./controllers/report.controller');
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

  // Loan schedules: one strategy per frequency (add a frequency = add a line here)
  const roundingUnitCents = env.loans.roundingUnit * 100;
  const monthlyStrategy = new MonthlyScheduleStrategy({ roundingUnitCents });
  const scheduleCalculator = new LoanScheduleCalculator({
    strategies: {
      monthly: monthlyStrategy,
      biweekly: new BiweeklyScheduleStrategy({
        roundingUnitCents,
        dueDateRule: env.loans.biweeklyDueDates,
      }),
    },
  });

  // Repositories
  const transactionManager = new TransactionManager({ db });
  const healthRepository = new HealthRepository({ db });
  const clientRepository = new ClientRepository({ db });
  const clientPhotoRepository = new ClientPhotoRepository({ db });
  const loanRepository = new LoanRepository({ db });
  const userRepository = new UserRepository({ db });
  const roleRepository = new RoleRepository({ db });
  const expenseRepository = new ExpenseRepository({ db });
  const expenseCategoryRepository = new ExpenseCategoryRepository({ db });
  const permissionRepository = new PermissionRepository({ db });
  const loanInstallmentRepository = new LoanInstallmentRepository({ db });
  const paymentRepository = new PaymentRepository({ db });
  const paymentAllocationRepository = new PaymentAllocationRepository({ db });
  const paymentScheduleChangeRepository = new PaymentScheduleChangeRepository({ db });
  const dueDateChangeRepository = new InstallmentDueDateChangeRepository({ db });
  const reportRepository = new ReportRepository({ db });
  const interestRateRepository = new InterestRateRepository({ db });

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
  const scheduleKeeper = new LoanScheduleKeeper({
    loanRepository,
    loanInstallmentRepository,
    monthlyStrategy,
    transactionManager,
    clock,
  });
  const interestRateService = new InterestRateService({ interestRateRepository });
  const loanService = new LoanService({
    loanRepository,
    loanInstallmentRepository,
    paymentRepository,
    clientRepository,
    dueDateChangeRepository,
    interestRateService,
    scheduleCalculator,
    scheduleKeeper,
    transactionManager,
    clock,
  });
  const dueDateService = new InstallmentDueDateService({
    loanRepository,
    loanInstallmentRepository,
    dueDateChangeRepository,
    loanService,
    transactionManager,
  });
  const paymentService = new PaymentService({
    loanRepository,
    loanInstallmentRepository,
    paymentRepository,
    paymentAllocationRepository,
    paymentScheduleChangeRepository,
    paymentAllocator: new PaymentAllocator(),
    installmentRescheduler: new InstallmentRescheduler({ scheduleCalculator, roundingUnitCents }),
    dueDateService,
    scheduleKeeper,
    transactionManager,
    clock,
  });
  const collectionService = new CollectionService({
    loanInstallmentRepository,
    paymentRepository,
    scheduleKeeper,
    clock,
  });
  const reportService = new ReportService({ reportRepository, clock });
  const managerSafeguard = new ManagerSafeguard({ userRepository });
  const userService = new UserService({
    userRepository,
    roleRepository,
    passwordHasher,
    managerSafeguard,
  });
  const roleService = new RoleService({
    roleRepository,
    permissionRepository,
    managerSafeguard,
  });

  // Controllers
  const healthController = new HealthController({ healthService });
  const clientController = new ClientController({ clientService });
  const clientPhotoController = new ClientPhotoController({ clientPhotoService });
  const authController = new AuthController({ authService });
  const expenseController = new ExpenseController({ expenseService });
  const expenseCategoryController = new ExpenseCategoryController({ expenseCategoryService });
  const userController = new UserController({ userService });
  const roleController = new RoleController({ roleService });
  const loanController = new LoanController({ loanService, dueDateService });
  const interestRateController = new InterestRateController({ interestRateService });
  const paymentController = new PaymentController({ paymentService });
  const collectionController = new CollectionController({ collectionService });
  const reportController = new ReportController({ reportService });
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
      userController,
      roleController,
      loanController,
      interestRateController,
      paymentController,
      collectionController,
      reportController,
    },
    middlewares: { authenticate },
  };
};

module.exports = { createContainer };
