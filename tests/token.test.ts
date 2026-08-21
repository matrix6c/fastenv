import { describe, it, expect } from 'vitest';
import { encode, decode, base32Encode, base32Decode, ALPHABET } from '../src/token.js';
import { TokenError } from '../src/types.js';
import { randomBytes } from 'node:crypto';

describe('token', () => {
  describe('ALPHABET', () => {
    it('has exactly 32 characters', () => {
      expect(ALPHABET.length).toBe(32);
    });

    it('excludes ambiguous characters 0, O, 1, l, I', () => {
      expect(ALPHABET).not.toContain('0');
      expect(ALPHABET).not.toContain('O');
      expect(ALPHABET).not.toContain('1');
      expect(ALPHABET).not.toContain('l');
      expect(ALPHABET).not.toContain('I');
    });
  });

  describe('base32Encode / base32Decode', () => {
    it('round-trips a known buffer', () => {
      const buf = Buffer.from([0x00, 0xff, 0x80, 0x40, 0x20]);
      const encoded = base32Encode(buf);
      const decoded = base32Decode(encoded);
      expect(decoded).toEqual(buf);
    });

    it('round-trips a 20-byte buffer (token payload size)', () => {
      const buf = randomBytes(20);
      const encoded = base32Encode(buf);
      const decoded = base32Decode(encoded);
      expect(decoded).toEqual(buf);
    });

    it('encodes 20 bytes to 32 base32 characters', () => {
      const buf = randomBytes(20);
      const encoded = base32Encode(buf);
      expect(encoded.length).toBe(32);
    });

    it('throws TokenError for invalid characters', () => {
      expect(() => base32Decode('0OIl')).toThrow(TokenError);
    });
  });

  describe('encode / decode', () => {
    it('round-trips random ID and secretKey', () => {
      const id = randomBytes(4);
      const secretKey = randomBytes(16);
      const token = encode(id, secretKey);
      const result = decode(token);
      expect(Buffer.from(result.id)).toEqual(id);
      expect(Buffer.from(result.secretKey)).toEqual(secretKey);
    });

    it('produces token with envlock_ prefix', () => {
      const id = randomBytes(4);
      const secretKey = randomBytes(16);
      const token = encode(id, secretKey);
      expect(token.startsWith('envlock_')).toBe(true);
    });

    it('produces token with dash-separated 4-char chunks after prefix', () => {
      const id = randomBytes(4);
      const secretKey = randomBytes(16);
      const token = encode(id, secretKey);
      const body = token.slice('envlock_'.length);
      const chunks = body.split('-');
      // All chunks except possibly the last should be 4 chars
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(chunks[i].length).toBe(4);
      }
      // Last chunk should be 1-4 chars
      expect(chunks[chunks.length - 1].length).toBeGreaterThanOrEqual(1);
      expect(chunks[chunks.length - 1].length).toBeLessThanOrEqual(4);
    });

    it('decodes case-insensitively', () => {
      const id = randomBytes(4);
      const secretKey = randomBytes(16);
      const token = encode(id, secretKey);

      const lowerToken = token.toLowerCase();
      const upperToken = 'envlock_' + token.slice('envlock_'.length).toUpperCase();

      const resultLower = decode(lowerToken);
      const resultUpper = decode(upperToken);

      expect(Buffer.from(resultLower.id)).toEqual(id);
      expect(Buffer.from(resultLower.secretKey)).toEqual(secretKey);
      expect(Buffer.from(resultUpper.id)).toEqual(id);
      expect(Buffer.from(resultUpper.secretKey)).toEqual(secretKey);
    });

    it('throws TokenError for missing prefix', () => {
      expect(() => decode('invalid_ABCD-EFGH')).toThrow(TokenError);
      expect(() => decode('invalid_ABCD-EFGH')).toThrow('missing envlock_ prefix');
    });

    it('throws TokenError for empty token body', () => {
      expect(() => decode('envlock_')).toThrow(TokenError);
      expect(() => decode('envlock_')).toThrow('empty token body');
    });

    it('throws TokenError for wrong decoded length', () => {
      // Encode only 10 bytes instead of 20
      const shortBuf = randomBytes(10);
      const encoded = base32Encode(shortBuf);
      const chunks = encoded.match(/.{1,4}/g)!;
      const badToken = 'envlock_' + chunks.join('-');
      expect(() => decode(badToken)).toThrow(TokenError);
      expect(() => decode(badToken)).toThrow('expected 20 bytes');
    });

    it('throws TokenError for invalid characters in body', () => {
      // 'O' is not in the alphabet
      expect(() => decode('envlock_OOOO-OOOO-OOOO')).toThrow(TokenError);
    });
  });
});
