const { addUpdatedAtTrigger } = require('../utils/migration-helpers');

const TABLE_NAME = 'client_photos';

exports.up = async (knex) => {
  await knex.schema.createTable(TABLE_NAME, (table) => {
    table.increments('id');
    table
      .integer('client_id')
      .notNullable()
      .references('id')
      .inTable('clients')
      .onDelete('CASCADE');
    // Slot 1..3. Combined with the unique constraint below, this caps photos at 3 per client.
    table.smallint('position').notNullable();
    // Object keys inside the private R2 bucket (not URLs: signed URLs expire,
    // so the backend generates a fresh one on each request).
    table.string('storage_key', 255).notNullable();
    table.string('thumbnail_key', 255).notNullable();
    table.string('content_type', 50).notNullable();
    table.integer('size_bytes').notNullable();
    table.timestamps(true, true);

    table.unique(['client_id', 'position'], { indexName: 'client_photos_client_position_unique' });
    table.check('position BETWEEN 1 AND 3', [], 'client_photos_position_check');
    table.check('size_bytes > 0', [], 'client_photos_size_bytes_check');
  });
  await addUpdatedAtTrigger(knex, TABLE_NAME);
};

exports.down = (knex) => knex.schema.dropTableIfExists(TABLE_NAME);
