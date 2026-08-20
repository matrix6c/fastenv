import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt } from '../src/crypto.js';
import { CryptoError } from '../src/types.js';

describe('crypto', () => {
  describe('encrypt', () => {
    it('returns a blob with ciphertext, iv, and authTag as hex strings', () => {
      const result = encrypt('hello world');
      expect(result.blob.ciphertext).toMatch(/^[0-9a-f]+$/);
      expect(result.blob.iv).toMatch(/^[0-9a-f]+$/);
      expect(result.blob.authTag).toMatch(/^[0-9a-f]+$/);
    });

    it('returns a 32-byte key', () => {
      const result = encrypt('test');
      expect(result.key).toBeInstanceOf(Buffer);
      expect(result.key.length).toBe(32);
    });

    it('generates a 12-byte IV (24 hex chars)', () => {
      const result = encrypt('test');
      expect(result.blob.iv.length).toBe(24);
    });

    it('generates a 16-byte auth tag (32 hex chars)', () => {
      const result = encrypt('test');
      expect(result.blob.authTag.length).toBe(32);
    });

    it('accepts Buffer input', () => {
      const buf = Buffer.from('binary data');
      const result = encrypt(buf);
      expect(result.blob.ciphertext).toMatch(/^[0-9a-f]+$/);
    });

    it('produces different ciphertext for the same plaintext (random key/iv)', () => {
      const r1 = encrypt('same input');
      const r2 = encrypt('same input');
      expect(r1.blob.ciphertext).not.toBe(r2.blob.ciphertext);
      expect(r1.key).not.toEqual(r2.key);
    });

    it('encrypts empty input', () => {
      const result = encrypt('');
      expect(result.blob.ciphertext).toBe('');
      const decrypted = decrypt(result.blob, result.key);
      expect(decrypted.toString()).toBe('');
    });
  });

  describe('decrypt', () => {
    it('decrypts back to the original string plaintext', () => {
      const plaintext = 'hello world';
      const { blob, key } = encrypt(plaintext);
      const decrypted = decrypt(blob, key);
      expect(decrypted.toString()).toBe(plaintext);
    });

    it('decrypts back to the original Buffer plaintext', () => {
      const plaintext = Buffer.from([0x00, 0x01, 0x02, 0xff]);
      const { blob, key } = encrypt(plaintext);
      const decrypted = decrypt(blob, key);
      expect(decrypted).toEqual(plaintext);
    });

    it('round-trips 0 bytes', () => {
      const plaintext = Buffer.alloc(0);
      const { blob, key } = encrypt(plaintext);
      const decrypted = decrypt(blob, key);
      expect(decrypted.length).toBe(0);
    });

    it('round-trips 1 byte', () => {
      const plaintext = Buffer.from([0x42]);
      const { blob, key } = encrypt(plaintext);
      const decrypted = decrypt(blob, key);
      expect(decrypted).toEqual(plaintext);
    });

    it('round-trips at least 10 KB', () => {
      const plaintext = randomBytes(10 * 1024);
      const { blob, key } = encrypt(plaintext);
      const decrypted = decrypt(blob, key);
      expect(decrypted).toEqual(plaintext);
    });

    it('throws CryptoError with wrong key', () => {
      const { blob } = encrypt('secret');
      const wrongKey = randomBytes(32);
      expect(() => decrypt(blob, wrongKey)).toThrow(CryptoError);
    });

    it('throws CryptoError with tampered ciphertext', () => {
      const { blob, key } = encrypt('secret');
      const tampered = { ...blob, ciphertext: 'ff' + blob.ciphertext.slice(2) };
      expect(() => decrypt(tampered, key)).toThrow(CryptoError);
    });

    it('throws CryptoError with tampered authTag', () => {
      const { blob, key } = encrypt('secret');
      const tampered = { ...blob, authTag: '0'.repeat(32) };
      expect(() => decrypt(tampered, key)).toThrow(CryptoError);
    });

    it('throws CryptoError with tampered iv', () => {
      const { blob, key } = encrypt('secret');
      const tampered = { ...blob, iv: '0'.repeat(24) };
      expect(() => decrypt(tampered, key)).toThrow(CryptoError);
    });

    it('error message does not reveal key or plaintext', () => {
      const plaintext = 'super_secret_value_12345';
      const { blob, key } = encrypt(plaintext);
      const wrongKey = randomBytes(32);
      try {
        decrypt(blob, wrongKey);
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).not.toContain(plaintext);
        expect(msg).not.toContain(key.toString('hex'));
        expect(msg).toBe('Decryption failed: authentication error');
      }
    });
  });
});
