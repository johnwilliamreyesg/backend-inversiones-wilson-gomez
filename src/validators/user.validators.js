const { z } = require('../config/validation');
const { paginationSchema, queryBoolean } = require('./common.validators');
const { newPassword } = require('./auth.validators');

const fullName = z
  .string('El nombre es obligatorio.')
  .trim()
  .min(3, 'El nombre debe tener al menos 3 caracteres.')
  .max(150, 'El nombre admite máximo 150 caracteres.');

const email = z
  .string('El correo es obligatorio.')
  .trim()
  .toLowerCase()
  .pipe(z.email('El correo no es válido.').max(150, 'El correo admite máximo 150 caracteres.'));

const roleId = z.coerce
  .number('El rol es obligatorio.')
  .int()
  .positive('El rol debe ser un id positivo.');

const createUserSchema = z.object({ fullName, email, password: newPassword, roleId });

// Users are never deleted (clients and expenses record who created them):
// they are deactivated with isActive: false.
const updateUserSchema = z
  .object({ fullName, email, roleId, isActive: z.boolean('isActive debe ser true o false.') })
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Envíe al menos un campo para actualizar.');

const resetPasswordSchema = z.object({ newPassword });

const listUsersQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  roleId: roleId.optional(),
  isActive: queryBoolean.optional(),
});

module.exports = { createUserSchema, updateUserSchema, resetPasswordSchema, listUsersQuerySchema };
