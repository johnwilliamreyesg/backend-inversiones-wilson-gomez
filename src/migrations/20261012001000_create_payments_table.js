const { addUpdatedAtTrigger } = require('../utils/migration-helpers');

const TABLE_NAME = 'payments';

// Money actually received. Payments are never deleted: mistakes are voided
// so reports from past days stay reproducible.
exports.up = async (knex) => {
  await knex.schema.createTable(TABLE_NAME, (table) => {
    table.increments('id');
    table.integer('loan_id').notNullable().references('id').inTable('loans').onDelete('RESTRICT');
    table.date('payment_date').notNullable();
    table.decimal('amount', 14, 2).notNullable();
    table.decimal('principal_amount', 14, 2).notNullable().defaultTo(0);
    table.decimal('interest_amount', 14, 2).notNullable().defaultTo(0);
    table.string('payment_method', 20).notNullable().defaultTo('cash');
    table.text('notes');
    table.integer('received_by').references('id').inTable('users').onDelete('RESTRICT');
    table.timestamp('voided_at');
    table.integer('voided_by').references('id').inTable('users').onDelete('RESTRICT');
    table.string('void_reason', 255);
    table.timestamps(true, true);

    table.index(['loan_id']);
    table.index(['payment_date']);

    table.check('amount > 0', [], 'payments_amount_check');
    table.check(
      'principal_amount >= 0 AND interest_amount >= 0 AND amount = principal_amount + interest_amount',
      [],
      'payments_split_check',
    );
    table.check("payment_method IN ('cash', 'transfer')", [], 'payments_method_check');
    table.check(
      '(voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL) OR voided_at IS NOT NULL',
      [],
      'payments_void_check',
    );
  });
  await addUpdatedAtTrigger(knex, TABLE_NAME);
};

exports.down = (knex) => knex.schema.dropTableIfExists(TABLE_NAME);
