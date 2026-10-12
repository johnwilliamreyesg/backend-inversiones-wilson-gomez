// Helpers shared by migrations. They live outside src/migrations because
// Knex would try to run any .js file inside that folder as a migration.

/**
 * Attaches the `set_updated_at` trigger so `updated_at` refreshes on every UPDATE.
 * The trigger is dropped automatically when its table is dropped.
 */
const addUpdatedAtTrigger = (knex, tableName) =>
  knex.raw(`
    CREATE TRIGGER trg_${tableName}_updated_at
    BEFORE UPDATE ON ${tableName}
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);

module.exports = { addUpdatedAtTrigger };
