const path = require('path');
const { ForbiddenError } = require('../errors/app-error');

// Only used with the local storage driver: serves files behind signed links.
// With R2, the browser downloads photos directly from Cloudflare.
class FileController {
  constructor({ fileStorage }) {
    this.fileStorage = fileStorage;
  }

  serve = async (req, res) => {
    // Express 5 returns the wildcard as an array of path segments.
    const key = req.params.key.join('/');
    const { expires, signature } = req.query;

    if (!this.fileStorage.verifySignature(key, expires, signature)) {
      throw new ForbiddenError('El enlace de la foto no es válido o ya expiró.');
    }

    const file = await this.fileStorage.read(key);
    res
      .type(path.extname(key))
      .set({
        'Cache-Control': 'private, max-age=3600',
        // Helmet defaults to same-origin; the frontend runs on another origin
        // and must be able to show these images in <img> tags.
        'Cross-Origin-Resource-Policy': 'cross-origin',
      })
      .send(file);
  };
}

module.exports = { FileController };
