const { z } = require('../config/validation');
const { optionalText } = require('./common.validators');

const name = z
  .string('El nombre es obligatorio.')
  .trim()
  .min(3, 'El nombre debe tener al menos 3 caracteres.')
  .max(50, 'El nombre admite máximo 50 caracteres.');

// Permission codes such as "clients.read"; duplicates are removed.
// The service checks that every code exists.
const permissions = z
  .array(z.string().trim().min(1), 'Los permisos deben ser una lista de códigos.')
  .max(100)
  .transform((codes) => [...new Set(codes)]);

const createRoleSchema = z.object({
  name,
  description: optionalText(255),
  permissions,
});

const updateRoleSchema = z
  .object({ name, description: optionalText(255), permissions })
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Envíe al menos un campo para actualizar.');

module.exports = { createRoleSchema, updateRoleSchema };
