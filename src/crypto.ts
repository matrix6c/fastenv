import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import type { CiphertextBlob, EncryptResult } from './types.js';
import { CryptoError } from './types.js';

export const KEY_LENGTH = 16;

export function encrypt(plaintext: Buffer | string): EncryptResult {
  const key = randomBytes(KEY_LENGTH);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-128-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(typeof plaintext === 'string' ? Buffer.from(plaintext) : plaintext),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    blob: {
      ciphertext: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    },
    key,
  };
}

export function decrypt(blob: CiphertextBlob, key: Buffer): Buffer {
  try {
    const decipher = createDecipheriv(
      'aes-128-gcm',
      key,
      Buffer.from(blob.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(blob.authTag, 'hex'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(blob.ciphertext, 'hex')),
      decipher.final(),
    ]);

    return decrypted;
  } catch (err) {
    throw new CryptoError('Decryption failed: authentication error');
  }
}
