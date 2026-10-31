const TABLE_NAME = 'expense_categories';
const INDEX_NAME = 'expense_categories_name_lower_unique';

// "Transporte" and "transporte" must be the same category: replace the
// case-sensitive UNIQUE constraint with a unique index on LOWER(name).
exports.up = async (knex) => {
  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.dropUnique(['name']);
  });
  await knex.raw(`CREATE UNIQUE INDEX ${INDEX_NAME} ON ${TABLE_NAME} (LOWER(name))`);
};

exports.down = async (knex) => {
  await knex.raw(`DROP INDEX IF EXISTS ${INDEX_NAME}`);
  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.unique(['name']);
  });
};
