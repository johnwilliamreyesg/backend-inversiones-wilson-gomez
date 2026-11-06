// Payment types: regular installment, interest only, or principal prepayment
// ("abono a capital"). A prepayment on a fixed-term loan recalculates the
// installments still to come; payment_schedule_changes keeps how they were,
// so voiding the payment can put them back exactly.
exports.up = async (knex) => {
  await knex.schema.alterTable('payments', (table) => {
    table.string('payment_type', 20).notNullable().defaultTo('installment');
    // Only when a prepayment recalculated a fixed-term schedule.
    table.string('recalculation', 20);

    table.check(
      "payment_type IN ('installment', 'interest_only', 'principal')",
      [],
      'payments_payment_type_check',
    );
    table.check(
      "recalculation IS NULL OR (payment_type = 'principal' AND recalculation IN ('reduce_installment', 'reduce_term'))",
      [],
      'payments_recalculation_check',
    );
  });

  await knex.schema.createTable('payment_schedule_changes', (table) => {
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
    // The installment as it was before the payment recalculated it.
    table.decimal('previous_principal_due', 14, 2).notNullable();
    table.decimal('previous_interest_due', 14, 2).notNullable();
    table.decimal('previous_amount_due', 14, 2).notNullable();
    table.string('previous_status', 20).notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['payment_id', 'installment_id'], {
      indexName: 'payment_schedule_changes_payment_installment_unique',
    });
    table.index(['installment_id']);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('payment_schedule_changes');
  await knex.schema.alterTable('payments', (table) => {
    table.dropChecks(['payments_recalculation_check', 'payments_payment_type_check']);
    table.dropColumn('recalculation');
    table.dropColumn('payment_type');
  });
};
