const { addUpdatedAtTrigger } = require('../utils/migration-helpers');

const TABLE_NAME = 'interest_rates';

// Starting catalog requested by the client: 2 % to 10 % per month.
const INITIAL_RATES = [2, 3, 4, 5, 6, 7, 8, 9, 10];

const MANAGE_PERMISSION = { code: 'interest_rates.manage', description: 'Administrar tasas de interés' };

// Monthly interest rates offered when a loan is created. A loan copies the
// rate value (loans.monthly_interest_rate), so changing or deactivating a rate
// here never alters loans that already exist.
//
// The initial rates and the permission are inserted here, not only in the
// seeds, because creating a monthly loan now requires a rate from this table:
// an existing database must keep working right after `db:migrate`.
exports.up = async (knex) => {
  await knex.schema.createTable(TABLE_NAME, (table) => {
    table.increments('id');
    // Percentage per month: 10.00 means 10 %. Same type as loans.monthly_interest_rate.
    table.decimal('rate', 5, 2).notNullable().unique();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);

    table.check('rate > 0 AND rate <= 100', [], 'interest_rates_rate_check');
  });
  await addUpdatedAtTrigger(knex, TABLE_NAME);

  await knex(TABLE_NAME).insert(INITIAL_RATES.map((rate) => ({ rate })));

  // Give the new permission to the admin role, if the seeds already created it.
  const [permission] = await knex('permissions')
    .insert(MANAGE_PERMISSION)
    .onConflict('code')
    .merge()
    .returning('id');
  const admin = await knex('roles').where({ name: 'admin' }).first('id');
  if (admin) {
    await knex('role_permissions')
      .insert({ role_id: admin.id, permission_id: permission.id })
      .onConflict(['role_id', 'permission_id'])
      .ignore();
  }
};

exports.down = async (knex) => {
  // role_permissions rows go away with the permission (ON DELETE CASCADE).
  await knex('permissions').where({ code: MANAGE_PERMISSION.code }).delete();
  await knex.schema.dropTableIfExists(TABLE_NAME);
};
