const { addUpdatedAtTrigger } = require('../utils/migration-helpers');

const TABLE_NAME = 'roles';

exports.up = async (knex) => {
  await knex.schema.createTable(TABLE_NAME, (table) => {
    table.increments('id');
    table.string('name', 50).notNullable().unique();
    table.string('description', 255);
    table.timestamps(true, true);
  });
  await addUpdatedAtTrigger(knex, TABLE_NAME);
};

exports.down = (knex) => knex.schema.dropTableIfExists(TABLE_NAME);
