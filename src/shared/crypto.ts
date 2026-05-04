/**
 * SHA-256 hashing using the Web Crypto API.
 *
 * Works in both browser and Node.js 20+ (where `globalThis.crypto.subtle`
 * is available without additional imports).
 *
 * IMPORTANT: `crypto.subtle.digest` requires a secure context (HTTPS or
 * localhost) in the browser. This is acceptable for the project.
 */

export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
