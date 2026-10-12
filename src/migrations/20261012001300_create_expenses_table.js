const { addUpdatedAtTrigger } = require('../utils/migration-helpers');

const TABLE_NAME = 'expenses';

exports.up = async (knex) => {
  await knex.schema.createTable(TABLE_NAME, (table) => {
    table.increments('id');
    table
      .integer('category_id')
      .notNullable()
      .references('id')
      .inTable('expense_categories')
      .onDelete('RESTRICT');
    table.date('expense_date').notNullable();
    table.decimal('amount', 14, 2).notNullable();
    table.string('description', 255).notNullable();
    table.integer('created_by').references('id').inTable('users').onDelete('RESTRICT');
    table.timestamps(true, true);
    table.timestamp('deleted_at');

    table.index(['expense_date']);
    table.index(['category_id']);
    table.check('amount > 0', [], 'expenses_amount_check');
  });
  await addUpdatedAtTrigger(knex, TABLE_NAME);
};

exports.down = (knex) => knex.schema.dropTableIfExists(TABLE_NAME);
