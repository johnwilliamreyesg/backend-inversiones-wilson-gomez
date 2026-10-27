const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { NotFoundError } = require('../errors/app-error');

// Keys look like "clients/12/9f1c...-thumb.jpg". Anything else (e.g. "../")
// is rejected before touching the disk.
const SAFE_KEY_PATTERN = /^[a-z0-9-]+(\/[a-z0-9-]+)*\.jpg$/;

/**
 * Development storage: files on this server's disk.
 *
 * Mimics a private bucket: files are only reachable through signed links that
 * expire (HMAC of key + expiry), served by GET /api/files/... — the same
 * behavior R2 has with presigned URLs, so the rest of the app cannot tell
 * the difference.
 */
class LocalFileStorage {
  constructor({ directory, publicBaseUrl, signingSecret, signedUrlTtlSeconds, now = Date.now }) {
    this.directory = path.resolve(directory);
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, '');
    this.signingSecret = signingSecret;
    this.signedUrlTtlSeconds = signedUrlTtlSeconds;
    this.now = now;
  }

  async put(key, buffer) {
    const filePath = this.resolvePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
  }

  async delete(keys) {
    await Promise.all(
      keys.map((key) =>
        fs.unlink(this.resolvePath(key)).catch((error) => {
          if (error.code !== 'ENOENT') throw error; // already gone = fine
        }),
      ),
    );
  }

  async getSignedUrl(key) {
    this.resolvePath(key);
    const expires = Math.floor(this.now() / 1000) + this.signedUrlTtlSeconds;
    const signature = this.sign(key, expires);
    return `${this.publicBaseUrl}/api/files/${key}?expires=${expires}&signature=${signature}`;
  }

  /** True only for an untampered, unexpired link produced by getSignedUrl. */
  verifySignature(key, expires, signature) {
    const expiresAt = Number(expires);
    if (!SAFE_KEY_PATTERN.test(key) || !Number.isInteger(expiresAt) || typeof signature !== 'string') {
      return false;
    }
    if (expiresAt < Math.floor(this.now() / 1000)) return false;

    const expected = Buffer.from(this.sign(key, expiresAt), 'hex');
    const received = Buffer.from(signature, 'hex');
    // Constant-time comparison: response time does not reveal how much matched.
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  }

  async read(key) {
    try {
      return await fs.readFile(this.resolvePath(key));
    } catch (error) {
      if (error.code === 'ENOENT') throw new NotFoundError('El archivo no existe.');
      throw error;
    }
  }

  sign(key, expires) {
    return crypto.createHmac('sha256', this.signingSecret).update(`${key}:${expires}`).digest('hex');
  }

  resolvePath(key) {
    const filePath = path.resolve(this.directory, key);
    if (!SAFE_KEY_PATTERN.test(key) || !filePath.startsWith(this.directory + path.sep)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return filePath;
  }
}

module.exports = { LocalFileStorage };
