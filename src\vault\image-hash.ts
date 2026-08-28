// Image content hashing
// Provides unique, deterministic identifiers for images based on their raw content
// Uses a fast sampling-based fingerprint that works in all contexts (HTTP/HTTPS)

/**
 * FNV-1a 32-bit hash - fast, non-cryptographic, excellent distribution.
 * Works in all browser contexts (no crypto.subtle needed).
 */
function fnv1a(data: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Compute a 64-char hex hash of a base64-encoded image.
 * Strategy: split the raw bytes into 2 segments, hash each with FNV-1a,
 * then also hash length + sampled pixels for extra uniqueness.
 * This produces a deterministic 64-char fingerprint that is unique per image.
 */
export async function hashImage(base64: string): Promise<string> {
  // Strip any data URI prefix
  const raw = base64.includes(',') ? base64.split(',')[1] : base64;

  // Convert base64 to bytes
  const binaryStr = atob(raw);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Hash first half
  const halfLen = Math.floor(len / 2);
  const h1 = fnv1a(bytes.slice(0, halfLen));
  // Hash second half
  const h2 = fnv1a(bytes.slice(halfLen));
  // Hash sampled pixels (every 1024th byte) + length
  const sampleSize = Math.min(Math.floor(len / 1024), 4096);
  const sample = new Uint8Array(sampleSize + 8);
  for (let i = 0; i < sampleSize; i++) {
    sample[i] = bytes[Math.floor(i * len / sampleSize)];
  }
  // Encode length into last 8 bytes
  const view = new DataView(sample.buffer, sampleSize, 8);
  view.setUint32(0, len & 0xFFFFFFFF);
  view.setUint32(4, (len >>> 32) & 0xFFFFFFFF);
  const h3 = fnv1a(sample);
  // Hash of the raw base64 string itself (catches encoding differences)
  const encoder = new TextEncoder();
  const strBytes = encoder.encode(raw.substring(0, Math.min(raw.length, 8192)));
  const h4 = fnv1a(strBytes);

  // Combine into 64-char hex (4 x 16 chars each)
  return (h1 + h2 + h3 + h4).padEnd(64, '0');
}

/**
 * Get the short form of a hash (first 16 chars) for use as directory name.
 */
export function shortHash(hash: string): string {
  return hash.substring(0, 16);
}

/**
 * Compute a composite cache key for planning: hash(imageHash + userInput).
 * Planning depends on both the image content AND the user's text request,
 * so the same image with different prompts produces different cache keys.
 */
export async function hashPlanningKey(imageHash: string, userInput: string): Promise<string> {
  const combined = imageHash + '|' + userInput;
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  // Use double FNV-1a for 64-char result
  const h1 = fnv1a(data);
  // Shift bytes and hash again for second half
  const shifted = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    shifted[i] = data[(i + 1) % data.length] ^ 0x5A;
  }
  const h2 = fnv1a(shifted);
  return (h1 + h2).padEnd(64, '0');
}

