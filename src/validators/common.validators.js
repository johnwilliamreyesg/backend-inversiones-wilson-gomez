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

module.exports = { idParamSchema, paginationSchema, optionalText };
