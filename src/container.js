const db = require('./config/database');
const { HealthRepository } = require('./repositories/health.repository');
const { HealthService } = require('./services/health.service');
const { HealthController } = require('./controllers/health.controller');

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

  // Services
  const healthService = new HealthService({ healthRepository });

  // Controllers
  const healthController = new HealthController({ healthService });

  return {
    db,
    controllers: { healthController },
  };
};

module.exports = { createContainer };
