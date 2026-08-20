import { describe, it } from 'vitest';
import fc from 'fast-check';
import { encrypt, decrypt } from '../src/crypto.js';

describe('crypto properties', () => {
  /**
   * Property 1: Crypto encrypt/decrypt round-trip
   *
   * For any arbitrary byte sequence (including empty, single-byte, and multi-kilobyte inputs),
   * encrypting with encrypt() then decrypting the resulting blob with the returned key using
   * decrypt() SHALL produce a buffer identical to the original input.
   *
   * **Validates: Requirements 1.4, 2.3, 7.3, 10.1**
   */
  it('Property 1: encrypt/decrypt round-trip for arbitrary byte sequences', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 15000 }), (data) => {
        const plaintext = Buffer.from(data);
        const { blob, key } = encrypt(plaintext);
        const decrypted = decrypt(blob, key);
        return plaintext.equals(decrypted);
      }),
      { numRuns: 100 }
    );
  });
});
