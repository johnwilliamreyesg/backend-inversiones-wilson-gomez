const env = require('../config/env');
const { PasswordHasher } = require('../security/password-hasher');

// Creates the first administrator from ADMIN_* variables in .env.
// Never overwrites an existing user (so a changed password is not reset).
exports.seed = async (knex) => {
  const { fullName, email, password } = env.admin;
  if (!fullName || !email || !password) {
    console.warn('Skipping admin seed: ADMIN_FULL_NAME, ADMIN_EMAIL or ADMIN_PASSWORD is missing.');
    return;
  }

  const existingUser = await knex('users').whereRaw('LOWER(email) = LOWER(?)', [email]).first();
  if (existingUser) return;

  const adminRole = await knex('roles').where({ name: 'admin' }).first();
  if (!adminRole) {
    throw new Error('Role "admin" not found. Run 01_roles_and_permissions first.');
  }

  await knex('users').insert({
    role_id: adminRole.id,
    full_name: fullName,
    email: email.toLowerCase(),
    password_hash: await new PasswordHasher().hash(password),
  });
};
