// Idempotent: safe to run many times (upserts by unique keys).
// Codes are identifiers used by the code; descriptions are display text for the UI.
const PERMISSIONS = [
  { code: 'clients.read', description: 'Ver clientes' },
  { code: 'clients.create', description: 'Crear clientes' },
  { code: 'clients.update', description: 'Editar clientes' },
  { code: 'clients.delete', description: 'Eliminar clientes' },
  { code: 'loans.read', description: 'Ver créditos' },
  { code: 'loans.create', description: 'Crear créditos' },
  { code: 'loans.update', description: 'Editar créditos' },
  { code: 'payments.read', description: 'Ver cobros' },
  { code: 'payments.create', description: 'Registrar cobros' },
  { code: 'payments.void', description: 'Anular cobros' },
  { code: 'expenses.read', description: 'Ver gastos' },
  { code: 'expenses.create', description: 'Registrar gastos' },
  { code: 'expenses.update', description: 'Editar gastos' },
  { code: 'expenses.delete', description: 'Eliminar gastos' },
  { code: 'reports.read', description: 'Ver reportes' },
  { code: 'users.manage', description: 'Administrar usuarios y roles' },
];

const ADMIN_ROLE = { name: 'admin', description: 'Acceso total al sistema' };

exports.seed = async (knex) => {
  await knex.transaction(async (trx) => {
    const [adminRole] = await trx('roles')
      .insert(ADMIN_ROLE)
      .onConflict('name')
      .merge()
      .returning('id');

    const permissions = await trx('permissions')
      .insert(PERMISSIONS)
      .onConflict('code')
      .merge()
      .returning('id');

    // Phase 1 has a single profile: admin gets every permission.
    await trx('role_permissions')
      .insert(permissions.map(({ id }) => ({ role_id: adminRole.id, permission_id: id })))
      .onConflict(['role_id', 'permission_id'])
      .ignore();
  });
};
