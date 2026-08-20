import type { DecodedToken } from './types.js';
import { TokenError } from './types.js';

/**
 * Custom base32 alphabet excluding ambiguous characters (0/O, 1/l/I).
 * 32 characters: 2-9, A-H, J-N, P-T, V-Z (uppercase canonical)
 */
export const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' as const;

const PREFIX = 'envlock_';

/**
 * Encodes an 8-byte ID and 32-byte secret key into a shareable token string.
 * Format: envlock_XXXX-XXXX-XXXX-... (base32 in 4-char dash-separated chunks)
 */
export function encode(id: Buffer, secretKey: Buffer): string {
  const combined = Buffer.concat([id, secretKey]); // 40 bytes
  const encoded = base32Encode(combined);
  const chunks = encoded.match(/.{1,4}/g)!;
  return PREFIX + chunks.join('-');
}

/**
 * Decodes a shareable token string back into its ID and secret key components.
 * Accepts tokens case-insensitively.
 * @throws TokenError for invalid format or wrong decoded length
 */
export function decode(token: string): DecodedToken {
  if (!token.toLowerCase().startsWith(PREFIX.toLowerCase())) {
    throw new TokenError('Invalid token: missing envlock_ prefix');
  }

  const raw = token.slice(PREFIX.length);
  const normalized = raw.replace(/-/g, '').toUpperCase();

  if (normalized.length === 0) {
    throw new TokenError('Invalid token: empty token body');
  }

  const bytes = base32Decode(normalized);

  if (bytes.length !== 40) {
    throw new TokenError('Invalid token: expected 40 bytes after decoding');
  }

  return {
    id: bytes.subarray(0, 8),
    secretKey: bytes.subarray(8, 40),
  };
}

/**
 * Encodes a buffer to a base32 string using the custom alphabet.
 * Converts bytes to 5-bit chunks mapped to alphabet characters.
 */
export function base32Encode(buffer: Buffer): string {
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    result += ALPHABET[parseInt(chunk, 2)];
  }
  return result;
}

/**
 * Decodes a base32 string back to a buffer using the custom alphabet.
 * @throws TokenError for invalid characters not in the alphabet
 */
export function base32Decode(encoded: string): Buffer {
  let bits = '';
  for (const char of encoded) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) {
      throw new TokenError(`Invalid character in token: ${char}`);
    }
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}
