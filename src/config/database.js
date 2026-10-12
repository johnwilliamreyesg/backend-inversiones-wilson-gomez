const knex = require('knex');
const { types } = require('pg');
const knexConfig = require('../../knexfile');
const env = require('./env');
const { toSnakeCase, convertResultToCamelCase } = require('../utils/case-converter');

// PostgreSQL type OIDs: https://github.com/brianc/node-pg-types
const NUMERIC_OID = 1700;
const DATE_OID = 1082;

// By default `pg` returns NUMERIC columns as strings to avoid precision loss.
// Our money values (COP, max 14 digits) fit safely in a JS number.
types.setTypeParser(NUMERIC_OID, (value) => Number(value));

// Keep DATE columns as 'YYYY-MM-DD' strings. Converting them to JS Date
// objects shifts the day depending on the server time zone.
types.setTypeParser(DATE_OID, (value) => value);

// One shared connection pool for the whole app (singleton by module cache).
// The app writes camelCase (`{ fullName }`) and the database stores snake_case
// (`full_name`); Knex translates both ways. Migrations and seeds run through
// the CLI with the plain knexfile config, so they use real column names.
const database = knex({
  ...knexConfig[env.nodeEnv],
  wrapIdentifier: (value, originalImpl) =>
    originalImpl(value === '*' ? value : toSnakeCase(value)),
  postProcessResponse: (result) => convertResultToCamelCase(result),
});

module.exports = database;
