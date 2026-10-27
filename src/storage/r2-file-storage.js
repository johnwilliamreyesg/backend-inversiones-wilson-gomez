const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const REQUIRED_SETTINGS = ['accountId', 'accessKeyId', 'secretAccessKey', 'bucket'];

/**
 * Production storage: Cloudflare R2 (S3-compatible API).
 * The bucket must be PRIVATE: photos (including ID documents) are only
 * reachable through presigned URLs that expire.
 */
class R2FileStorage {
  constructor({ accountId, accessKeyId, secretAccessKey, bucket, signedUrlTtlSeconds, client }) {
    const settings = { accountId, accessKeyId, secretAccessKey, bucket };
    const missing = REQUIRED_SETTINGS.filter((name) => !settings[name]);
    if (missing.length > 0 && !client) {
      throw new Error(`R2 storage is missing settings: ${missing.join(', ')} (see .env.example).`);
    }

    this.bucket = bucket;
    this.signedUrlTtlSeconds = signedUrlTtlSeconds;
    this.client =
      client ??
      new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
        // Only send checksums when an operation strictly needs them; keeps
        // the AWS SDK compatible with S3-like providers such as R2.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
  }

  async put(key, buffer, contentType) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  }

  // One request per key: only 2 objects per photo, and it avoids the
  // checksum requirements of the multi-delete API.
  async delete(keys) {
    await Promise.all(
      keys.map((key) => this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))),
    );
  }

  getSignedUrl(key) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: this.signedUrlTtlSeconds,
    });
  }
}

module.exports = { R2FileStorage };
