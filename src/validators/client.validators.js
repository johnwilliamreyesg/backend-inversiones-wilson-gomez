const { z } = require('../config/validation');
const { paginationSchema, optionalText } = require('./common.validators');

// Same rules as the CHECK constraints in the clients migration.
const fullName = z
  .string('El nombre es obligatorio.')
  .trim()
  .min(3, 'El nombre debe tener al menos 3 caracteres.')
  .max(150, 'El nombre admite máximo 150 caracteres.');

// Cédula or other ID document: letters, digits and dashes; stored uppercase.
// Minimum of 3 because very old Colombian cédulas can be that short.
const nationalId = z
  .string('La cédula es obligatoria.')
  .trim()
  .toUpperCase()
  .regex(/^[0-9A-Z-]{3,20}$/, 'La cédula debe tener entre 3 y 20 letras, números o guiones.');

const phoneCountryCode = z
  .string()
  .trim()
  .regex(/^[+][0-9]{1,4}$/, 'El indicativo debe tener el formato +57.');

// Accepts "300 123 4567" or "300-123-4567" and stores only digits.
const phoneNumber = z
  .string('El teléfono es obligatorio.')
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^[0-9]{6,15}$/, 'El teléfono debe tener entre 6 y 15 dígitos.'));

const createClientSchema = z.object({
  fullName,
  nationalId,
  phoneCountryCode: phoneCountryCode.default('+57'),
  phoneNumber,
  address: optionalText(255),
  notes: optionalText(2000),
});

const updateClientSchema = z
  .object({
    fullName,
    nationalId,
    phoneCountryCode,
    phoneNumber,
    address: optionalText(255),
    notes: optionalText(2000),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Envíe al menos un campo para actualizar.');

const listClientsQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
});

module.exports = { createClientSchema, updateClientSchema, listClientsQuerySchema };
