const { Router } = require('express');
const { validateRequest } = require('../middlewares/validate-request');
const { authorize } = require('../middlewares/authorize');
const { uploadImage } = require('../middlewares/upload-image');
const {
  clientPhotoParamsSchema,
  clientPhotoSlotParamsSchema,
} = require('../validators/client-photo.validators');

// Mounted at /clients/:clientId/photos; mergeParams exposes :clientId here.
const createClientPhotoRoutes = ({ clientPhotoController }) => {
  const router = Router({ mergeParams: true });

  router.get(
    '/',
    authorize('clients.read'),
    validateRequest({ params: clientPhotoParamsSchema }),
    clientPhotoController.list,
  );
  // Params are validated BEFORE reading the upload, so an invalid slot is
  // rejected without buffering a 15 MB file.
  router.put(
    '/:position',
    authorize('clients.update'),
    validateRequest({ params: clientPhotoSlotParamsSchema }),
    uploadImage('photo'),
    clientPhotoController.upload,
  );
  router.delete(
    '/:position',
    authorize('clients.update'),
    validateRequest({ params: clientPhotoSlotParamsSchema }),
    clientPhotoController.delete,
  );

  return router;
};

module.exports = { createClientPhotoRoutes };
