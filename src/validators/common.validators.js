const { z } = require('../config/validation');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('El id debe ser un número positivo.'),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

// Optional free text: trims it and turns '' into null, so the database
// never stores empty strings in nullable columns.
const optionalText = (maxLength) =>
  z
    .string()
    .trim()
    .max(maxLength, `Máximo ${maxLength} caracteres.`)
    .nullish()
    .transform((value) => value || null);

// Calendar date as 'YYYY-MM-DD' (rejects impossible dates like 2026-02-30).
const isoDate = (message = 'La fecha debe tener el formato AAAA-MM-DD.') =>
  z.iso.date(message);

// Money in pesos: positive, at most 2 decimals, fits NUMERIC(14,2).
const MAX_AMOUNT = 999_999_999_999.99;
const moneyAmount = z
  .number('El valor debe ser un número.')
  .positive('El valor debe ser mayor que cero.')
  .max(MAX_AMOUNT, 'El valor es demasiado grande.')
  .multipleOf(0.01, 'El valor admite máximo 2 decimales.');

// Query-string boolean: only "true"/"false" (z.coerce.boolean would turn "false" into true).
const queryBoolean = z.enum(['true', 'false']).transform((value) => value === 'true');

module.exports = {
  idParamSchema,
  paginationSchema,
  optionalText,
  isoDate,
  moneyAmount,
  queryBoolean,
};
