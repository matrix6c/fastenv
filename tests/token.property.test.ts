import { describe, it } from 'vitest';
import fc from 'fast-check';
import { encode, decode } from '../src/token.js';

describe('token properties', () => {
  /**
   * Property 2: Token encode/decode round-trip
   * For any random 8-byte ID and 32-byte secret key, encoding with encode(id, secretKey)
   * then decoding with decode() SHALL produce buffers identical to the original ID and secret key.
   *
   * Validates: Requirements 5.3, 5.5, 5.6, 5.7, 10.2
   */
  it('Property 2: encode/decode round-trip for arbitrary ID and key', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 8, maxLength: 8 }),
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        (idArr, keyArr) => {
          const id = Buffer.from(idArr);
          const secretKey = Buffer.from(keyArr);
          const token = encode(id, secretKey);
          const decoded = decode(token);
          return id.equals(Buffer.from(decoded.id)) && secretKey.equals(Buffer.from(decoded.secretKey));
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: Token case-insensitive decode
   * For any valid token produced by encode(), converting to lowercase (or mixed case)
   * and decoding SHALL produce the same ID and secret key.
   *
   * Validates: Requirements 5.6
   */
  it('Property 3: case-insensitive decode produces same result', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 8, maxLength: 8 }),
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        (idArr, keyArr) => {
          const id = Buffer.from(idArr);
          const secretKey = Buffer.from(keyArr);
          const token = encode(id, secretKey);
          const lowerDecoded = decode(token.toLowerCase());
          const upperDecoded = decode(token.toUpperCase());
          return (
            id.equals(Buffer.from(lowerDecoded.id)) &&
            secretKey.equals(Buffer.from(lowerDecoded.secretKey)) &&
            id.equals(Buffer.from(upperDecoded.id)) &&
            secretKey.equals(Buffer.from(upperDecoded.secretKey))
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
