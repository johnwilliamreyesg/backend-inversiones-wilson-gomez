// Data access only: knows how to talk to the database, knows nothing about HTTP.
class HealthRepository {
  constructor({ db }) {
    this.db = db;
  }

  async ping() {
    await this.db.raw('SELECT 1');
  }
}

module.exports = { HealthRepository };
