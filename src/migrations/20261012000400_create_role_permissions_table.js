const TABLE_NAME = 'role_permissions';

// Many-to-many: a role has many permissions, a permission belongs to many roles.
exports.up = (knex) =>
  knex.schema.createTable(TABLE_NAME, (table) => {
    table.integer('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE');
    table
      .integer('permission_id')
      .notNullable()
      .references('id')
      .inTable('permissions')
      .onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.primary(['role_id', 'permission_id']);
    table.index(['permission_id']);
  });

exports.down = (knex) => knex.schema.dropTableIfExists(TABLE_NAME);
