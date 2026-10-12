const { addUpdatedAtTrigger } = require('../utils/migration-helpers');

const TABLE_NAME = 'clients';

exports.up = async (knex) => {
  await knex.schema.createTable(TABLE_NAME, (table) => {
    table.increments('id');
    table.string('full_name', 150).notNullable();
    // Colombian "cédula". Stored as text to keep leading zeros and allow other ID formats.
    table.string('national_id', 20).notNullable();
    table.string('phone_country_code', 5).notNullable().defaultTo('+57');
    table.string('phone_number', 20).notNullable();
    table.string('address', 255);
    table.text('notes');
    table.integer('created_by').references('id').inTable('users').onDelete('RESTRICT');
    table.timestamps(true, true);
    // Soft delete: clients with loan history must never be physically removed.
    table.timestamp('deleted_at');

    table.index(['full_name']);
    table.check("phone_country_code ~ '^[+][0-9]{1,4}$'", [], 'clients_phone_country_code_check');
    table.check("phone_number ~ '^[0-9]{6,15}$'", [], 'clients_phone_number_check');
  });

  // The same national_id can exist only once among non-deleted clients.
  await knex.raw(`
    CREATE UNIQUE INDEX clients_national_id_unique
    ON ${TABLE_NAME} (national_id)
    WHERE deleted_at IS NULL;
  `);
  await addUpdatedAtTrigger(knex, TABLE_NAME);
};

exports.down = (knex) => knex.schema.dropTableIfExists(TABLE_NAME);
