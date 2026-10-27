const multer = require('multer');
const { ValidationError } = require('../errors/app-error');

// Phone cameras produce 3–12 MB photos; they are shrunk to ~300 KB after processing.
const MAX_UPLOAD_MB = 15;

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: `La foto supera el tamaño máximo de ${MAX_UPLOAD_MB} MB.`,
  LIMIT_FILE_COUNT: 'Envíe una sola foto por petición.',
  LIMIT_UNEXPECTED_FILE: 'La foto debe enviarse en el campo "photo".',
};

/**
 * Reads one file from a multipart/form-data request into memory (req.file).
 * Content checks (is it really an image?) happen later in ImageProcessor.
 */
const uploadImage = (fieldName) => {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  }).single(fieldName);

  return (req, res, next) => {
    upload(req, res, (error) => {
      if (error instanceof multer.MulterError) {
        return next(new ValidationError(MULTER_MESSAGES[error.code] ?? error.message));
      }
      if (error) return next(error);
      if (!req.file) {
        return next(new ValidationError(`Adjunte la foto en el campo "${fieldName}".`));
      }
      return next();
    });
  };
};

module.exports = { uploadImage };
