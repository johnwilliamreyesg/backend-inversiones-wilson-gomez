const TABLE_NAME = 'users';

// Each JWT carries the token_version it was issued with. Incrementing it
// (e.g. on password change) invalidates every token issued before, which
// stateless JWTs cannot do on their own.
exports.up = (knex) =>
  knex.schema.alterTable(TABLE_NAME, (table) => {
    table.integer('token_version').notNullable().defaultTo(0);
  });

exports.down = (knex) =>
  knex.schema.alterTable(TABLE_NAME, (table) => {
    table.dropColumn('token_version');
  });
