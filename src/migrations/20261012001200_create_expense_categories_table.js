const { addUpdatedAtTrigger } = require('../utils/migration-helpers');

const TABLE_NAME = 'expense_categories';

exports.up = async (knex) => {
  await knex.schema.createTable(TABLE_NAME, (table) => {
    table.increments('id');
    table.string('name', 100).notNullable().unique();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });
  await addUpdatedAtTrigger(knex, TABLE_NAME);
};

exports.down = (knex) => knex.schema.dropTableIfExists(TABLE_NAME);
