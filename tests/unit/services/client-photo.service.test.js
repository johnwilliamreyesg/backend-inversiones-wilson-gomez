const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ClientPhotoService } = require('../../../src/services/client-photo.service');
const { NotFoundError } = require('../../../src/errors/app-error');

const createFakeStorage = () => ({
  files: new Map(),
  failOnDelete: false,
  async put(key, buffer) {
    this.files.set(key, buffer);
  },
  async delete(keys) {
    if (this.failOnDelete) throw new Error('storage down');
    keys.forEach((key) => this.files.delete(key));
  },
  async getSignedUrl(key) {
    return `https://signed/${key}`;
  },
});

const createFakePhotoRepository = () => ({
  rows: [],
  failOnUpsert: false,
  async findByClientId(clientId) {
    return this.rows.filter((row) => row.clientId === clientId);
  },
  async upsert({ clientId, position, ...data }) {
    if (this.failOnUpsert) throw new Error('db down');
    const previous = this.rows.find((row) => row.clientId === clientId && row.position === position);
    const photo = { id: previous?.id ?? this.rows.length + 1, clientId, position, ...data };
    this.rows = this.rows.filter((row) => row !== previous).concat(photo);
    return { photo, previous };
  },
  async deleteByPosition(clientId, position) {
    const deleted = this.rows.find((row) => row.clientId === clientId && row.position === position);
    this.rows = this.rows.filter((row) => row !== deleted);
    return deleted;
  },
});

const fakeImageProcessor = {
  async process(buffer) {
    return {
      image: { buffer: Buffer.from(`big:${buffer}`), contentType: 'image/jpeg' },
      thumbnail: { buffer: Buffer.from(`small:${buffer}`), contentType: 'image/jpeg' },
    };
  },
};

const fakeClientRepository = {
  async findById(id) {
    return id === 1 ? { id: 1 } : undefined;
  },
};

describe('ClientPhotoService', () => {
  let storage;
  let photoRepository;
  let service;
  let ids;
  let loggedErrors;

  beforeEach(() => {
    storage = createFakeStorage();
    photoRepository = createFakePhotoRepository();
    ids = ['aaa', 'bbb', 'ccc'];
    loggedErrors = [];
    service = new ClientPhotoService({
      clientRepository: fakeClientRepository,
      clientPhotoRepository: photoRepository,
      imageProcessor: fakeImageProcessor,
      fileStorage: storage,
      generateId: () => ids.shift(),
      logger: { error: (message) => loggedErrors.push(message) },
    });
  });

  it('uploads image + thumbnail and returns signed links without storage keys', async () => {
    const photo = await service.upload(1, 1, { buffer: Buffer.from('raw') });

    assert.deepEqual([...storage.files.keys()], ['clients/1/aaa.jpg', 'clients/1/aaa-thumb.jpg']);
    assert.equal(photo.url, 'https://signed/clients/1/aaa.jpg');
    assert.equal(photo.thumbnailUrl, 'https://signed/clients/1/aaa-thumb.jpg');
    assert.equal(photo.storageKey, undefined);
    assert.equal(photo.position, 1);
  });

  it('replacing a slot deletes the old files', async () => {
    await service.upload(1, 2, { buffer: Buffer.from('first') });
    await service.upload(1, 2, { buffer: Buffer.from('second') });

    assert.deepEqual([...storage.files.keys()], ['clients/1/bbb.jpg', 'clients/1/bbb-thumb.jpg']);
    assert.equal(photoRepository.rows.length, 1);
  });

  it('removes the just-uploaded files when saving the row fails', async () => {
    photoRepository.failOnUpsert = true;
    await assert.rejects(service.upload(1, 1, { buffer: Buffer.from('raw') }), /db down/);
    assert.equal(storage.files.size, 0, 'no orphan files must remain');
  });

  it('still succeeds when cleaning up replaced files fails (logs the orphan)', async () => {
    await service.upload(1, 1, { buffer: Buffer.from('first') });
    storage.failOnDelete = true;

    const photo = await service.upload(1, 1, { buffer: Buffer.from('second') });

    assert.equal(photo.url, 'https://signed/clients/1/bbb.jpg');
    assert.equal(loggedErrors.length, 1);
  });

  it('rejects uploads for a client that does not exist, before processing anything', async () => {
    await assert.rejects(service.upload(99, 1, { buffer: Buffer.from('raw') }), NotFoundError);
    assert.equal(storage.files.size, 0);
  });

  it('lists photos with signed links', async () => {
    await service.upload(1, 1, { buffer: Buffer.from('a') });
    await service.upload(1, 3, { buffer: Buffer.from('b') });

    const photos = await service.list(1);
    assert.deepEqual(photos.map((photo) => photo.position).sort(), [1, 3]);
    assert.ok(photos.every((photo) => photo.url.startsWith('https://signed/')));
  });

  it('deletes a photo and its files', async () => {
    await service.upload(1, 1, { buffer: Buffer.from('a') });
    await service.delete(1, 1);

    assert.equal(storage.files.size, 0);
    assert.equal(photoRepository.rows.length, 0);
  });

  it('deleting an empty slot is a 404', async () => {
    await assert.rejects(service.delete(1, 2), /posición 2/);
  });
});
