const TABLE_NAME = 'installment_due_date_changes';

// History of every due date moved by hand ("reagendar"): a single installment,
// the following ones, or what was left of an installment after an interest-only
// payment (payment_id), so voiding that payment can put the date back.
exports.up = (knex) =>
  knex.schema.createTable(TABLE_NAME, (table) => {
    table.increments('id');
    table.integer('loan_id').notNullable().references('id').inTable('loans').onDelete('CASCADE');
    table
      .integer('installment_id')
      .notNullable()
      .references('id')
      .inTable('loan_installments')
      .onDelete('CASCADE');
    table.integer('payment_id').references('id').inTable('payments').onDelete('RESTRICT');
    table.date('previous_due_date').notNullable();
    table.date('new_due_date').notNullable();
    table.string('reason', 255);
    table.integer('changed_by').references('id').inTable('users').onDelete('RESTRICT');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['loan_id']);
    table.index(['installment_id']);
    table.index(['payment_id']);
    table.check('previous_due_date <> new_due_date', [], 'installment_due_date_changes_differ_check');
  });

exports.down = (knex) => knex.schema.dropTableIfExists(TABLE_NAME);
