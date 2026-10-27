const crypto = require('crypto');
const { LocalFileStorage } = require('./local-file-storage');
const { R2FileStorage } = require('./r2-file-storage');

/**
 * Picks the storage implementation from STORAGE_DRIVER. Both expose the same
 * methods (put, delete, getSignedUrl), so switching to R2 in production is a
 * configuration change, not a code change.
 */
const createFileStorage = ({ storageConfig, jwtSecret }) => {
  const { driver, signedUrlTtlSeconds } = storageConfig;

  if (driver === 'r2') {
    return new R2FileStorage({ ...storageConfig.r2, signedUrlTtlSeconds });
  }

  if (driver === 'local') {
    return new LocalFileStorage({
      ...storageConfig.local,
      // Derived key: file links and session tokens never share the same secret.
      signingSecret: crypto.createHmac('sha256', jwtSecret).update('local-file-storage').digest(),
      signedUrlTtlSeconds,
    });
  }

  throw new Error(`Unknown STORAGE_DRIVER "${driver}". Use "local" or "r2".`);
};

module.exports = { createFileStorage };
