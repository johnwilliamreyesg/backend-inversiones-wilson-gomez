const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { LocalFileStorage } = require('../../../src/storage/local-file-storage');
const { NotFoundError } = require('../../../src/errors/app-error');

const KEY = 'clients/1/abc-123.jpg';
const NOW_MS = 1_800_000_000_000;

const parseLink = (url) => {
  const { pathname, searchParams } = new URL(url);
  return {
    key: pathname.replace('/api/files/', ''),
    expires: searchParams.get('expires'),
    signature: searchParams.get('signature'),
  };
};

describe('LocalFileStorage', () => {
  let directory;
  let storage;
  let clock;

  before(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-test-'));
    clock = NOW_MS;
    storage = new LocalFileStorage({
      directory,
      publicBaseUrl: 'http://localhost:3000/',
      signingSecret: 'test-secret',
      signedUrlTtlSeconds: 60,
      now: () => clock,
    });
  });

  after(() => fs.rm(directory, { recursive: true, force: true }));

  it('stores, reads and deletes files', async () => {
    await storage.put(KEY, Buffer.from('jpeg-bytes'));
    assert.equal((await storage.read(KEY)).toString(), 'jpeg-bytes');

    await storage.delete([KEY, 'clients/1/missing.jpg']); // a missing file is not an error
    await assert.rejects(storage.read(KEY), NotFoundError);
  });

  it('produces links that verify', async () => {
    const link = parseLink(await storage.getSignedUrl(KEY));
    assert.equal(link.key, KEY);
    assert.equal(storage.verifySignature(link.key, link.expires, link.signature), true);
  });

  it('rejects tampered signatures, keys or expiry dates', async () => {
    const link = parseLink(await storage.getSignedUrl(KEY));
    const flipped = (link.signature[0] === 'a' ? 'b' : 'a') + link.signature.slice(1);

    assert.equal(storage.verifySignature(link.key, link.expires, flipped), false);
    assert.equal(storage.verifySignature('clients/2/abc-123.jpg', link.expires, link.signature), false);
    assert.equal(storage.verifySignature(link.key, String(Number(link.expires) + 3600), link.signature), false);
    assert.equal(storage.verifySignature(link.key, link.expires, undefined), false);
  });

  it('rejects expired links', async () => {
    const link = parseLink(await storage.getSignedUrl(KEY));
    clock += 61_000;
    assert.equal(storage.verifySignature(link.key, link.expires, link.signature), false);
    clock = NOW_MS;
  });

  it('refuses keys that try to escape the storage folder', async () => {
    await assert.rejects(storage.put('../outside.jpg', Buffer.from('x')), /Invalid storage key/);
    await assert.rejects(storage.read('clients/../../etc.jpg'), /Invalid storage key/);
    assert.equal(storage.verifySignature('../outside.jpg', '9999999999', 'aa'), false);
  });
});
