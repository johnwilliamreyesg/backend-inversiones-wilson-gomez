// Accent-insensitive search: "gomez" must find "Gómez" (users type on phones
// without accents). `unaccent` is a trusted extension since PostgreSQL 13,
// so the database owner can enable it without superuser rights.
exports.up = (knex) => knex.raw('CREATE EXTENSION IF NOT EXISTS unaccent;');

exports.down = (knex) => knex.raw('DROP EXTENSION IF EXISTS unaccent;');
