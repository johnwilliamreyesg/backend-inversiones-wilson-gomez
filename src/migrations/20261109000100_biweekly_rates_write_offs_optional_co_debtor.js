// 1. Biweekly loans with a rate: same math as monthly loans (equal
//    installments, interest on the initial principal, half the monthly rate
//    per fortnight) and two collection days per month (payment_day and
//    second_payment_day). Biweekly loans made before keep their agreed
//    installment (installment_amount) and keep working.
// 2. The co-debtor becomes optional.
// 3. Written-off portfolio ("cartera castigada"): a client is written off
//    with all their open loans (status 'written_off'); a payment agreement
//    (loan_renegotiations) can bring a loan back.
// 4. Permissions for writing off / negotiating and for the Excel backup.

const NEW_PERMISSIONS = [
  { code: 'portfolio.write_off', description: 'Castigar cartera y negociar acuerdos de pago' },
  { code: 'backup.download', description: 'Descargar copia de seguridad (Excel)' },
];

const OLD_STATUS_CHECK = "status IN ('active', 'paid_off', 'defaulted', 'cancelled')";
const NEW_STATUS_CHECK = "status IN ('active', 'paid_off', 'defaulted', 'cancelled', 'written_off')";
const OLD_TERMS_CHECK = `(frequency = 'monthly'
          AND monthly_interest_rate IS NOT NULL
          AND monthly_interest_rate > 0)
       OR
       (frequency = 'biweekly'
          AND installment_amount IS NOT NULL
          AND number_of_installments IS NOT NULL
          AND installment_amount * number_of_installments >= principal_amount)`;
const NEW_TERMS_CHECK = `(frequency = 'monthly'
          AND monthly_interest_rate IS NOT NULL
          AND monthly_interest_rate > 0)
       OR
       (frequency = 'biweekly'
          AND number_of_installments IS NOT NULL
          AND ((monthly_interest_rate IS NOT NULL AND monthly_interest_rate > 0 AND second_payment_day IS NOT NULL)
               OR (installment_amount IS NOT NULL AND installment_amount * number_of_installments >= principal_amount)))`;

const replaceCheck = (knex, name, expression) =>
  knex.raw(`ALTER TABLE loans DROP CONSTRAINT ${name}, ADD CONSTRAINT ${name} CHECK (${expression})`);

exports.up = async (knex) => {
  await knex.schema.alterTable('loans', (table) => {
    // Biweekly: second collection day of the month (payment_day is the first).
    table.smallint('second_payment_day');
    table.timestamp('written_off_at');
    // Set when a payment agreement replaced the schedule (no more automatic installments).
    table.timestamp('renegotiated_at');
    table.check('second_payment_day IS NULL OR second_payment_day BETWEEN 1 AND 31', [], 'loans_second_payment_day_check');
  });
  await knex.raw('ALTER TABLE loans ALTER COLUMN co_debtor_id DROP NOT NULL');
  await replaceCheck(knex, 'loans_status_check', NEW_STATUS_CHECK);
  await replaceCheck(knex, 'loans_terms_check', NEW_TERMS_CHECK);

  await knex.schema.alterTable('clients', (table) => {
    table.timestamp('written_off_at');
    table.integer('written_off_by').references('id').inTable('users').onDelete('RESTRICT');
    table.string('write_off_reason', 255);
  });

  // Payment agreement for a written-off loan: what was owed, what was agreed,
  // what was forgiven and the new installments.
  await knex.schema.createTable('loan_renegotiations', (table) => {
    table.increments('id');
    table.integer('loan_id').notNullable().references('id').inTable('loans').onDelete('CASCADE');
    table.decimal('previous_balance', 14, 2).notNullable();
    table.decimal('agreed_amount', 14, 2).notNullable();
    // Principal the lender gives up (previous balance not covered by the agreement).
    table.decimal('forgiven_principal', 14, 2).notNullable().defaultTo(0);
    table.string('frequency', 20).notNullable();
    table.smallint('number_of_installments').notNullable();
    table.date('first_due_date').notNullable();
    table.text('notes');
    table.integer('created_by').references('id').inTable('users').onDelete('RESTRICT');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['loan_id']);
    table.check('agreed_amount > 0 AND previous_balance >= 0 AND forgiven_principal >= 0', [], 'loan_renegotiations_amounts_check');
    table.check("frequency IN ('monthly', 'biweekly')", [], 'loan_renegotiations_frequency_check');
    table.check('number_of_installments > 0', [], 'loan_renegotiations_installments_check');
  });

  const permissions = await knex('permissions').insert(NEW_PERMISSIONS).onConflict('code').merge().returning('id');
  const admin = await knex('roles').where({ name: 'admin' }).first('id');
  if (admin) {
    await knex('role_permissions')
      .insert(permissions.map(({ id }) => ({ role_id: admin.id, permission_id: id })))
      .onConflict(['role_id', 'permission_id'])
      .ignore();
  }
};

exports.down = async (knex) => {
  // There is no co-debtor to invent: refuse instead of failing halfway.
  const withoutCoDebtor = await knex('loans').whereNull('co_debtor_id').count({ total: '*' });
  if (Number(withoutCoDebtor[0].total) > 0) {
    throw new Error(`No se puede revertir: ${withoutCoDebtor[0].total} crédito(s) no tienen codeudor y antes era obligatorio.`);
  }
  // Biweekly loans with a rate get the agreed installment the old rules require (their first installment).
  await knex.raw(`
    UPDATE loans SET installment_amount = (
      SELECT amount_due FROM loan_installments i WHERE i.loan_id = loans.id ORDER BY installment_number LIMIT 1)
     WHERE frequency = 'biweekly' AND installment_amount IS NULL`);

  await knex('permissions').whereIn('code', NEW_PERMISSIONS.map(({ code }) => code)).delete();
  await knex.schema.dropTableIfExists('loan_renegotiations');
  await knex.schema.alterTable('clients', (table) => {
    table.dropColumn('write_off_reason');
    table.dropColumn('written_off_by');
    table.dropColumn('written_off_at');
  });
  // Rolling back needs every loan to fit the old rules again.
  await knex('loans').where({ status: 'written_off' }).update({ status: 'defaulted' });
  await replaceCheck(knex, 'loans_terms_check', OLD_TERMS_CHECK);
  await replaceCheck(knex, 'loans_status_check', OLD_STATUS_CHECK);
  await knex.raw('ALTER TABLE loans ALTER COLUMN co_debtor_id SET NOT NULL');
  await knex.schema.alterTable('loans', (table) => {
    table.dropChecks(['loans_second_payment_day_check']);
    table.dropColumn('renegotiated_at');
    table.dropColumn('written_off_at');
    table.dropColumn('second_payment_day');
  });
};
