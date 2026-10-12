const env = require('./src/config/env');

const baseConfig = {
  client: 'pg',
  connection: {
    host: env.db.host,
    port: env.db.port,
    database: env.db.name,
    user: env.db.user,
    password: env.db.password,
    ssl: env.db.ssl ? { rejectUnauthorized: false } : false,
  },
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './src/migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './src/seeds',
  },
};

module.exports = {
  development: baseConfig,
  test: baseConfig,
  production: baseConfig,
};
