const TABLE_NAME = 'payment_allocations';

// How a single payment is distributed across installments
// (one payment can cover an overdue installment plus part of the next one).
exports.up = (knex) =>
  knex.schema.createTable(TABLE_NAME, (table) => {
    table.increments('id');
    table
      .integer('payment_id')
      .notNullable()
      .references('id')
      .inTable('payments')
      .onDelete('CASCADE');
    table
      .integer('installment_id')
      .notNullable()
      .references('id')
      .inTable('loan_installments')
      .onDelete('RESTRICT');
    table.decimal('principal_amount', 14, 2).notNullable().defaultTo(0);
    table.decimal('interest_amount', 14, 2).notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['payment_id', 'installment_id'], {
      indexName: 'payment_allocations_payment_installment_unique',
    });
    table.index(['installment_id']);

    table.check(
      'principal_amount >= 0 AND interest_amount >= 0 AND principal_amount + interest_amount > 0',
      [],
      'payment_allocations_amount_check',
    );
  });

exports.down = (knex) => knex.schema.dropTableIfExists(TABLE_NAME);
