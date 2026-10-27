const TABLE_NAME = 'clientPhotos';

const COLUMNS = [
  'id',
  'clientId',
  'position',
  'storageKey',
  'thumbnailKey',
  'contentType',
  'sizeBytes',
  'createdAt',
  'updatedAt',
];

class ClientPhotoRepository {
  constructor({ db }) {
    this.db = db;
  }

  findByClientId(clientId) {
    return this.db(TABLE_NAME).where({ clientId }).orderBy('position').select(COLUMNS);
  }

  /**
   * Inserts the photo in its slot, or replaces the one already there.
   * Returns { photo, previous } so the caller can delete the replaced files.
   * The row lock (FOR UPDATE) serializes two uploads to the same slot.
   */
  upsert({ clientId, position, ...data }) {
    return this.db.transaction(async (trx) => {
      const previous = await trx(TABLE_NAME)
        .where({ clientId, position })
        .forUpdate()
        .first(COLUMNS);

      const [photo] = previous
        ? await trx(TABLE_NAME).where({ id: previous.id }).update(data).returning(COLUMNS)
        : await trx(TABLE_NAME).insert({ clientId, position, ...data }).returning(COLUMNS);

      return { photo, previous };
    });
  }

  /** Deletes the photo in a slot and returns it (undefined if the slot was empty). */
  async deleteByPosition(clientId, position) {
    const [deleted] = await this.db(TABLE_NAME)
      .where({ clientId, position })
      .delete()
      .returning(COLUMNS);
    return deleted;
  }
}

module.exports = { ClientPhotoRepository };
