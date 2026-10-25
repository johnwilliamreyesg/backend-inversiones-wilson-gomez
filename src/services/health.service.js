// Business logic: decides what "healthy" means. Receives its repository
// through the constructor, so tests can pass a fake one.
class HealthService {
  constructor({ healthRepository }) {
    this.healthRepository = healthRepository;
  }

  async getStatus() {
    const database = await this.healthRepository
      .ping()
      .then(() => 'up')
      .catch(() => 'down');

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = { HealthService };
