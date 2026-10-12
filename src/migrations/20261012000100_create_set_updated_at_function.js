// Database-level function used by triggers to keep `updated_at` accurate,
// even when rows are updated outside the app (psql, scripts, etc.).
exports.up = (knex) =>
  knex.raw(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

exports.down = (knex) => knex.raw('DROP FUNCTION IF EXISTS set_updated_at();');
