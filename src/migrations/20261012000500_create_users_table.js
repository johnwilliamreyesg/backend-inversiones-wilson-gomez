const { addUpdatedAtTrigger } = require('../utils/migration-helpers');

const TABLE_NAME = 'users';

exports.up = async (knex) => {
  await knex.schema.createTable(TABLE_NAME, (table) => {
    table.increments('id');
    table.integer('role_id').notNullable().references('id').inTable('roles').onDelete('RESTRICT');
    table.string('full_name', 150).notNullable();
    table.string('email', 150).notNullable();
    table.string('password_hash', 255).notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('last_login_at');
    table.timestamps(true, true);
    table.index(['role_id']);
  });

  // Case-insensitive uniqueness: 'Admin@Mail.com' and 'admin@mail.com' are the same user.
  await knex.raw(`CREATE UNIQUE INDEX users_email_unique ON ${TABLE_NAME} (LOWER(email));`);
  await addUpdatedAtTrigger(knex, TABLE_NAME);
};

exports.down = (knex) => knex.schema.dropTableIfExists(TABLE_NAME);
