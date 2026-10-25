const db = require('./config/database');
const { HealthRepository } = require('./repositories/health.repository');
const { ClientRepository } = require('./repositories/client.repository');
const { LoanRepository } = require('./repositories/loan.repository');
const { HealthService } = require('./services/health.service');
const { ClientService } = require('./services/client.service');
const { HealthController } = require('./controllers/health.controller');
const { ClientController } = require('./controllers/client.controller');

/**
 * Composition root: the ONLY place where classes are instantiated and wired.
 * Every class receives its dependencies through the constructor (Dependency
 * Inversion), so no service or controller ever does `require` of a database
 * or of another layer's instance.
 *
 * Adding a module = create its repository -> service -> controller here.
 */
const createContainer = () => {
  // Repositories
  const healthRepository = new HealthRepository({ db });
  const clientRepository = new ClientRepository({ db });
  const loanRepository = new LoanRepository({ db });

  // Services
  const healthService = new HealthService({ healthRepository });
  const clientService = new ClientService({ clientRepository, loanRepository });

  // Controllers
  const healthController = new HealthController({ healthService });
  const clientController = new ClientController({ clientService });

  return {
    db,
    controllers: { healthController, clientController },
  };
};

module.exports = { createContainer };
