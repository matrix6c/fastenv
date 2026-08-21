// ─── Type Definitions ─────────────────────────────────────────────────────────

export type EnvEntryType = 'keyvalue' | 'comment' | 'blank' | 'unknown';
export type QuoteStyle = 'single' | 'double' | 'none';

export interface EnvEntry {
  type: EnvEntryType;
  key?: string;
  value?: string;
  raw: string;
  exported?: boolean;
  quoteStyle?: QuoteStyle;
}

export interface CiphertextBlob {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export interface EncryptResult {
  blob: CiphertextBlob;
  key: Buffer;
}

export interface DecodedToken {
  id: Buffer;
  secretKey: Buffer;
}

export interface NewKey {
  key: string;
  value: string;
}

export interface ChangedKey {
  key: string;
  currentValue: string;
  newValue: string;
}

export interface UnchangedKey {
  key: string;
  value: string;
}

export interface DiffResult {
  newKeys: NewKey[];
  changedKeys: ChangedKey[];
  unchangedKeys: UnchangedKey[];
}

// ─── Custom Error Classes ─────────────────────────────────────────────────────

export class FastenvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FastenvError';
  }
}

export class FileError extends FastenvError {
  constructor(message: string) {
    super(message);
    this.name = 'FileError';
  }
}

export class TokenError extends FastenvError {
  constructor(message: string) {
    super(message);
    this.name = 'TokenError';
  }
}

export class RedisError extends FastenvError {
  constructor(message: string) {
    super(message);
    this.name = 'RedisError';
  }
}

export class CryptoError extends FastenvError {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoError';
  }
}

export class ConfigError extends FastenvError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}
