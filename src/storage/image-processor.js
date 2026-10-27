const sharp = require('sharp');
const { ValidationError } = require('../errors/app-error');

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif']);
const UNSUPPORTED_MESSAGE = 'El archivo no es una imagen compatible. Use JPG, PNG o WEBP.';

/**
 * Normalizes every uploaded photo before it is stored:
 * - Verifies the real content is an image (the file name/MIME type can lie).
 * - Applies the phone's EXIF rotation, so photos are never sideways.
 * - Drops all metadata (GPS location, device) — sharp's output has none.
 * - Main image: max 1600px, JPEG 80%. Thumbnail: 320px square, JPEG 70%.
 */
class ImageProcessor {
  constructor({ maxDimension = 1600, quality = 80, thumbnailSize = 320, thumbnailQuality = 70 } = {}) {
    this.maxDimension = maxDimension;
    this.quality = quality;
    this.thumbnailSize = thumbnailSize;
    this.thumbnailQuality = thumbnailQuality;
  }

  async process(buffer) {
    const metadata = await sharp(buffer)
      .metadata()
      .catch(() => null);
    if (!metadata || !ACCEPTED_FORMATS.has(metadata.format)) {
      throw new ValidationError(UNSUPPORTED_MESSAGE);
    }

    try {
      const oriented = sharp(buffer).rotate();
      const [image, thumbnail] = await Promise.all([
        oriented
          .clone()
          .resize({
            width: this.maxDimension,
            height: this.maxDimension,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: this.quality, mozjpeg: true })
          .toBuffer(),
        oriented
          .clone()
          .resize({ width: this.thumbnailSize, height: this.thumbnailSize, fit: 'cover' })
          .jpeg({ quality: this.thumbnailQuality, mozjpeg: true })
          .toBuffer(),
      ]);

      return {
        image: { buffer: image, contentType: 'image/jpeg' },
        thumbnail: { buffer: thumbnail, contentType: 'image/jpeg' },
      };
    } catch {
      // e.g. iPhone HEIC: recognized as "heif" but not decodable by sharp's bundled libvips.
      throw new ValidationError(UNSUPPORTED_MESSAGE);
    }
  }
}

module.exports = { ImageProcessor };
