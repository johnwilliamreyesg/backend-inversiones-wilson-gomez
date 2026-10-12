const { addUpdatedAtTrigger } = require('../utils/migration-helpers');

const TABLE_NAME = 'loan_installments';

// The installment schedule ("proyección de cuotas") generated for each loan.
exports.up = async (knex) => {
  await knex.schema.createTable(TABLE_NAME, (table) => {
    table.increments('id');
    table.integer('loan_id').notNullable().references('id').inTable('loans').onDelete('CASCADE');
    table.smallint('installment_number').notNullable();
    table.date('due_date').notNullable();
    // Splitting principal and interest lets every report (profit, principal
    // collected) work the same way for both loan frequencies.
    table.decimal('principal_due', 14, 2).notNullable().defaultTo(0);
    table.decimal('interest_due', 14, 2).notNullable().defaultTo(0);
    table.decimal('amount_due', 14, 2).notNullable();
    table.decimal('principal_paid', 14, 2).notNullable().defaultTo(0);
    table.decimal('interest_paid', 14, 2).notNullable().defaultTo(0);
    table.string('status', 20).notNullable().defaultTo('pending');
    table.timestamp('paid_at');
    table.timestamps(true, true);

    table.unique(['loan_id', 'installment_number'], {
      indexName: 'loan_installments_loan_number_unique',
    });
    // Main access path for the "today's collections" list.
    table.index(['due_date', 'status']);

    table.check(
      "status IN ('pending', 'partially_paid', 'paid', 'cancelled')",
      [],
      'loan_installments_status_check',
    );
    table.check(
      'principal_due >= 0 AND interest_due >= 0 AND amount_due = principal_due + interest_due',
      [],
      'loan_installments_amount_due_check',
    );
    table.check(
      'principal_paid BETWEEN 0 AND principal_due AND interest_paid BETWEEN 0 AND interest_due',
      [],
      'loan_installments_paid_check',
    );
  });
  await addUpdatedAtTrigger(knex, TABLE_NAME);
};

exports.down = (knex) => knex.schema.dropTableIfExists(TABLE_NAME);
