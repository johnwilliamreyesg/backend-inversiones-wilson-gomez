const { z } = require('../config/validation');

const MAX_PHOTOS_PER_CLIENT = 3;

const clientPhotoParamsSchema = z.object({
  clientId: z.coerce.number().int().positive('El id del cliente debe ser un número positivo.'),
});

const clientPhotoSlotParamsSchema = clientPhotoParamsSchema.extend({
  position: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PHOTOS_PER_CLIENT, `La posición debe ser 1, 2 o ${MAX_PHOTOS_PER_CLIENT}.`),
});

module.exports = { clientPhotoParamsSchema, clientPhotoSlotParamsSchema };
