const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { ImageProcessor } = require('../../../src/storage/image-processor');
const { ValidationError } = require('../../../src/errors/app-error');

// A "phone photo": 4000x3000 PNG stored sideways (EXIF orientation 6 = rotate 90°)
// and carrying metadata that must not survive processing.
const createPhonePhoto = () =>
  sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#3366cc' } })
    .jpeg()
    .withMetadata({ orientation: 6, exif: { IFD0: { Make: 'TestPhone', Model: 'X1' } } })
    .toBuffer();

describe('ImageProcessor', () => {
  const processor = new ImageProcessor();

  it('rotates by EXIF, fits within 1600px and outputs JPEG without metadata', async () => {
    const { image } = await processor.process(await createPhonePhoto());
    const metadata = await sharp(image.buffer).metadata();

    assert.equal(metadata.format, 'jpeg');
    // 4000x3000 rotated 90° becomes portrait 3000x4000 -> fits as 1200x1600.
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 1600);
    assert.equal(metadata.exif, undefined, 'EXIF (device, GPS) must be stripped');
    assert.equal(metadata.orientation, undefined);
    assert.equal(image.contentType, 'image/jpeg');
  });

  it('creates a 320x320 thumbnail', async () => {
    const { thumbnail } = await processor.process(await createPhonePhoto());
    const metadata = await sharp(thumbnail.buffer).metadata();
    assert.deepEqual([metadata.width, metadata.height], [320, 320]);
  });

  it('never enlarges small images', async () => {
    const small = await sharp({ create: { width: 500, height: 400, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    const { image } = await processor.process(small);
    const metadata = await sharp(image.buffer).metadata();
    assert.deepEqual([metadata.width, metadata.height], [500, 400]);
  });

  it('rejects content that is not an image, whatever its name says', async () => {
    await assert.rejects(processor.process(Buffer.from('%PDF-1.7 not a photo')), ValidationError);
  });

  it('rejects unsupported image formats (e.g. GIF)', async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } })
      .gif()
      .toBuffer();
    await assert.rejects(processor.process(gif), ValidationError);
  });
});
