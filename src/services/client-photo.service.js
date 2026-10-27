const { randomUUID } = require('crypto');
const { NotFoundError } = require('../errors/app-error');

/**
 * Up to 3 photos per client, one per slot (position 1..3).
 *
 * The database is the source of truth. Files and rows are kept consistent:
 * - New files are uploaded BEFORE saving the row; if saving fails they are removed.
 * - Replaced/deleted files are removed AFTER the row changes; if that cleanup
 *   fails, an orphan file is logged but the user's operation still succeeds.
 */
class ClientPhotoService {
  constructor({
    clientRepository,
    clientPhotoRepository,
    imageProcessor,
    fileStorage,
    generateId = randomUUID,
    logger = console,
  }) {
    this.clientRepository = clientRepository;
    this.clientPhotoRepository = clientPhotoRepository;
    this.imageProcessor = imageProcessor;
    this.fileStorage = fileStorage;
    this.generateId = generateId;
    this.logger = logger;
  }

  async list(clientId) {
    await this.ensureClientExists(clientId);
    const photos = await this.clientPhotoRepository.findByClientId(clientId);
    return Promise.all(photos.map((photo) => this.toResponse(photo)));
  }

  async upload(clientId, position, file) {
    await this.ensureClientExists(clientId);
    const { image, thumbnail } = await this.imageProcessor.process(file.buffer);

    const baseKey = `clients/${clientId}/${this.generateId()}`;
    const storageKey = `${baseKey}.jpg`;
    const thumbnailKey = `${baseKey}-thumb.jpg`;

    let result;
    try {
      await Promise.all([
        this.fileStorage.put(storageKey, image.buffer, image.contentType),
        this.fileStorage.put(thumbnailKey, thumbnail.buffer, thumbnail.contentType),
      ]);
      result = await this.clientPhotoRepository.upsert({
        clientId,
        position,
        storageKey,
        thumbnailKey,
        contentType: image.contentType,
        sizeBytes: image.buffer.length,
      });
    } catch (error) {
      await this.deleteFilesQuietly([storageKey, thumbnailKey]);
      throw error;
    }

    if (result.previous) {
      await this.deleteFilesQuietly([result.previous.storageKey, result.previous.thumbnailKey]);
    }

    return this.toResponse(result.photo);
  }

  async delete(clientId, position) {
    await this.ensureClientExists(clientId);

    const deleted = await this.clientPhotoRepository.deleteByPosition(clientId, position);
    if (!deleted) {
      throw new NotFoundError(`El cliente no tiene foto en la posición ${position}.`);
    }

    await this.deleteFilesQuietly([deleted.storageKey, deleted.thumbnailKey]);
  }

  async ensureClientExists(clientId) {
    const client = await this.clientRepository.findById(clientId);
    if (!client) throw new NotFoundError('El cliente no existe.');
  }

  // Storage keys stay internal; the frontend only receives temporary links.
  async toResponse({ storageKey, thumbnailKey, clientId, ...photo }) {
    const [url, thumbnailUrl] = await Promise.all([
      this.fileStorage.getSignedUrl(storageKey),
      this.fileStorage.getSignedUrl(thumbnailKey),
    ]);
    return { ...photo, url, thumbnailUrl };
  }

  async deleteFilesQuietly(keys) {
    try {
      await this.fileStorage.delete(keys);
    } catch (error) {
      this.logger.error(`Could not delete stored files ${keys.join(', ')}:`, error);
    }
  }
}

module.exports = { ClientPhotoService };
