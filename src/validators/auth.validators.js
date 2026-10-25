const { z } = require('../config/validation');

// bcrypt only uses the first 72 BYTES of a password; anything longer would be
// silently ignored, so it is rejected instead (accented letters use 2 bytes).
const BCRYPT_MAX_BYTES = 72;
const MIN_PASSWORD_LENGTH = 8;

const newPassword = z
  .string('La nueva contraseña es obligatoria.')
  .min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= BCRYPT_MAX_BYTES,
    'La contraseña es demasiado larga.',
  )
  .refine(
    (value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value),
    'La contraseña debe tener al menos una letra y un número.',
  );

const loginSchema = z.object({
  email: z.string('El correo es obligatorio.').trim().toLowerCase().pipe(z.email('El correo no es válido.')),
  // No format rules on login: only "not empty". Rules apply when creating passwords.
  password: z.string('La contraseña es obligatoria.').min(1, 'La contraseña es obligatoria.'),
});

const changePasswordSchema = z.object({
  currentPassword: z
    .string('La contraseña actual es obligatoria.')
    .min(1, 'La contraseña actual es obligatoria.'),
  newPassword,
});

module.exports = { loginSchema, changePasswordSchema };
