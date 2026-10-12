const { addUpdatedAtTrigger } = require('../utils/migration-helpers');

const TABLE_NAME = 'loans';

exports.up = async (knex) => {
  await knex.schema.createTable(TABLE_NAME, (table) => {
    table.increments('id');
    table.integer('client_id').notNullable().references('id').inTable('clients').onDelete('RESTRICT');
    // The co-debtor must be another registered client (enforced by FK + check below).
    table
      .integer('co_debtor_id')
      .notNullable()
      .references('id')
      .inTable('clients')
      .onDelete('RESTRICT');
    // 'monthly'  -> interest rate applied to the outstanding principal.
    // 'biweekly' -> fixed agreed installment for a fixed number of installments.
    table.string('frequency', 20).notNullable();
    table.decimal('principal_amount', 14, 2).notNullable();
    // Percentage per month, e.g. 10.00 means 10%. Only for monthly loans.
    table.decimal('monthly_interest_rate', 5, 2);
    // Agreed installment. Only for biweekly loans.
    table.decimal('installment_amount', 14, 2);
    // Required for biweekly loans; optional for monthly (null = open-ended, interest only).
    table.smallint('number_of_installments');
    // Disbursement date: used by the "daily loan placement" report.
    table.date('start_date').notNullable();
    table.smallint('payment_day').notNullable();
    // Denormalized for fast daily lists; updated in the same transaction as each payment.
    table.decimal('principal_balance', 14, 2).notNullable();
    table.string('status', 20).notNullable().defaultTo('active');
    table.text('notes');
    table.integer('created_by').references('id').inTable('users').onDelete('RESTRICT');
    table.timestamps(true, true);

    table.index(['client_id']);
    table.index(['co_debtor_id']);
    table.index(['status']);
    table.index(['start_date']);

    table.check("frequency IN ('monthly', 'biweekly')", [], 'loans_frequency_check');
    table.check(
      "status IN ('active', 'paid_off', 'defaulted', 'cancelled')",
      [],
      'loans_status_check',
    );
    table.check('co_debtor_id <> client_id', [], 'loans_co_debtor_check');
    table.check('principal_amount > 0', [], 'loans_principal_amount_check');
    table.check(
      'principal_balance >= 0 AND principal_balance <= principal_amount',
      [],
      'loans_principal_balance_check',
    );
    table.check('payment_day BETWEEN 1 AND 31', [], 'loans_payment_day_check');
    table.check(
      'number_of_installments IS NULL OR number_of_installments > 0',
      [],
      'loans_number_of_installments_check',
    );
    // Each frequency must carry the terms it needs.
    table.check(
      `(frequency = 'monthly'
          AND monthly_interest_rate IS NOT NULL
          AND monthly_interest_rate > 0)
       OR
       (frequency = 'biweekly'
          AND installment_amount IS NOT NULL
          AND number_of_installments IS NOT NULL
          AND installment_amount * number_of_installments >= principal_amount)`,
      [],
      'loans_terms_check',
    );
  });
  await addUpdatedAtTrigger(knex, TABLE_NAME);
};

exports.down = (knex) => knex.schema.dropTableIfExists(TABLE_NAME);
