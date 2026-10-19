/**
 * Upload Validation & Security Module
 *
 * Implements strict multi-tier validation:
 * 1. File size enforcement (<= 5MB)
 * 2. MIME type whitelist: image/png, image/jpeg, image/webp, image/avif, image/gif
 * 3. Strict SVG rejection (image/svg+xml, embedded <svg>, XML declarations)
 * 4. Magic bytes verification to prevent MIME-type spoofing
 */

export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB

export const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/gif',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export interface ValidationResult {
  valid: boolean;
  mimeType?: AllowedMimeType;
  extension?: string;
  error?: string;
}

/**
 * Validates uploaded file buffers against strict size, MIME, and magic byte criteria.
 */
export function validateImageUpload(
  buffer: Uint8Array,
  declaredMimeType: string
): ValidationResult {
  // 1. File size limit
  if (buffer.length === 0) {
    return { valid: false, error: 'File is empty' };
  }

  if (buffer.length > MAX_UPLOAD_SIZE) {
    return {
      valid: false,
      error: `File size (${(buffer.length / (1024 * 1024)).toFixed(2)}MB) exceeds 5MB limit`,
    };
  }

  // 2. Strict SVG Rejection
  const lowerDeclaredMime = declaredMimeType.toLowerCase().trim();
  if (lowerDeclaredMime === 'image/svg+xml' || lowerDeclaredMime.includes('svg')) {
    return {
      valid: false,
      error: 'SVG uploads are strictly forbidden for security reasons (XSS prevention)',
    };
  }

  // Scan first 512 bytes for SVG payload disguised as binary
  const previewText = new TextDecoder('utf-8', { fatal: false }).decode(
    buffer.slice(0, Math.min(buffer.length, 512))
  );
  if (
    previewText.includes('<svg') ||
    previewText.includes('<SVG') ||
    previewText.includes('xmlns="http://www.w3.org/2000/svg"')
  ) {
    return {
      valid: false,
      error: 'File content contains forbidden SVG elements',
    };
  }

  // 3. MIME Whitelist
  if (!ALLOWED_MIME_TYPES.includes(lowerDeclaredMime as AllowedMimeType)) {
    return {
      valid: false,
      error: `Unsupported MIME type: ${declaredMimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
    };
  }

  // 4. Magic Bytes Verification
  const detectedType = detectMimeFromMagicBytes(buffer);
  if (!detectedType) {
    return {
      valid: false,
      error: 'File signature (magic bytes) does not match any allowed image format',
    };
  }

  if (detectedType !== lowerDeclaredMime) {
    return {
      valid: false,
      error: `MIME type spoofing detected: Declared ${declaredMimeType} but signature is ${detectedType}`,
    };
  }

  const extensions: Record<AllowedMimeType, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/gif': 'gif',
  };

  return {
    valid: true,
    mimeType: detectedType,
    extension: extensions[detectedType],
  };
}

/**
 * Detects image MIME type from binary file signature (magic bytes).
 */
export function detectMimeFromMagicBytes(bytes: Uint8Array): AllowedMimeType | null {
  if (bytes.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // GIF: 'GIF87a' (47 49 46 38 37 61) or 'GIF89a' (47 49 46 38 39 61)
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif';
  }

  // WebP: RIFF (bytes 0-3) + WEBP (bytes 8-11)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  // AVIF: bytes 4-11 contain ftypavif, ftypavis, or ftypmif1
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === 'avif' || brand === 'avis' || brand === 'mif1') {
      return 'image/avif';
    }
  }

  return null;
}
