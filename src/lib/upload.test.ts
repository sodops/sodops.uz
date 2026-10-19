import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateImageUpload, MAX_UPLOAD_SIZE } from './upload';

describe('Upload Validation & Security', () => {
  // Helper to create buffers with magic bytes
  function makePng(): Uint8Array {
    const bytes = new Uint8Array(32);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return bytes;
  }

  function makeJpeg(): Uint8Array {
    const bytes = new Uint8Array(32);
    bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
    return bytes;
  }

  function makeWebp(): Uint8Array {
    const bytes = new Uint8Array(32);
    // RIFF....WEBP
    bytes.set([0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    return bytes;
  }

  function makeGif(): Uint8Array {
    const bytes = new Uint8Array(32);
    // GIF89a
    bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    return bytes;
  }

  it('accepts valid PNG image with proper magic bytes', () => {
    const res = validateImageUpload(makePng(), 'image/png');
    assert.equal(res.valid, true);
    assert.equal(res.mimeType, 'image/png');
    assert.equal(res.extension, 'png');
  });

  it('accepts valid JPEG image with proper magic bytes', () => {
    const res = validateImageUpload(makeJpeg(), 'image/jpeg');
    assert.equal(res.valid, true);
    assert.equal(res.mimeType, 'image/jpeg');
    assert.equal(res.extension, 'jpg');
  });

  it('accepts valid WebP image with proper magic bytes', () => {
    const res = validateImageUpload(makeWebp(), 'image/webp');
    assert.equal(res.valid, true);
    assert.equal(res.mimeType, 'image/webp');
    assert.equal(res.extension, 'webp');
  });

  it('accepts valid GIF image with proper magic bytes', () => {
    const res = validateImageUpload(makeGif(), 'image/gif');
    assert.equal(res.valid, true);
    assert.equal(res.mimeType, 'image/gif');
    assert.equal(res.extension, 'gif');
  });

  it('strictly rejects files exceeding 5MB limit', () => {
    const oversized = new Uint8Array(MAX_UPLOAD_SIZE + 1024);
    oversized.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const res = validateImageUpload(oversized, 'image/png');

    assert.equal(res.valid, false);
    assert.ok(res.error?.includes('exceeds 5MB limit'));
  });

  it('strictly rejects SVG uploads by MIME type', () => {
    const svgBytes = new TextEncoder().encode('<svg><circle cx="5" cy="5" r="5"/></svg>');
    const res = validateImageUpload(svgBytes, 'image/svg+xml');

    assert.equal(res.valid, false);
    assert.ok(res.error?.includes('SVG uploads are strictly forbidden'));
  });

  it('strictly rejects disguised SVG uploads with forged MIME type', () => {
    const disguised = new TextEncoder().encode(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    );
    const res = validateImageUpload(disguised, 'image/png');

    assert.equal(res.valid, false);
    assert.ok(
      res.error?.includes('forbidden SVG elements') || res.error?.includes('signature')
    );
  });

  it('strictly rejects spoofed MIME types with mismatched magic bytes', () => {
    // Declared JPEG but actually PNG bytes
    const png = makePng();
    const res = validateImageUpload(png, 'image/jpeg');

    assert.equal(res.valid, false);
    assert.ok(res.error?.includes('spoofing detected'));
  });

  it('strictly rejects executable or text files disguised as images', () => {
    const textBytes = new TextEncoder().encode('echo "malicious script"; exit 0;');
    const res = validateImageUpload(textBytes, 'image/png');

    assert.equal(res.valid, false);
    assert.ok(res.error?.includes('magic bytes'));
  });
});
