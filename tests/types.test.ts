import { describe, it, expect } from 'vitest';
import {
  ElockError,
  FileError,
  TokenError,
  RedisError,
  CryptoError,
  ConfigError,
} from '../src/types.js';

describe('Custom Error Classes', () => {
  it('ElockError sets name and message correctly', () => {
    const err = new ElockError('base error');
    expect(err.message).toBe('base error');
    expect(err.name).toBe('ElockError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ElockError);
  });

  it('FileError extends ElockError', () => {
    const err = new FileError('file not found');
    expect(err.message).toBe('file not found');
    expect(err.name).toBe('FileError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ElockError);
    expect(err).toBeInstanceOf(FileError);
  });

  it('TokenError extends ElockError', () => {
    const err = new TokenError('invalid token');
    expect(err.message).toBe('invalid token');
    expect(err.name).toBe('TokenError');
    expect(err).toBeInstanceOf(ElockError);
  });

  it('RedisError extends ElockError', () => {
    const err = new RedisError('connection failed');
    expect(err.message).toBe('connection failed');
    expect(err.name).toBe('RedisError');
    expect(err).toBeInstanceOf(ElockError);
  });

  it('CryptoError extends ElockError', () => {
    const err = new CryptoError('decryption failed');
    expect(err.message).toBe('decryption failed');
    expect(err.name).toBe('CryptoError');
    expect(err).toBeInstanceOf(ElockError);
  });

  it('ConfigError extends ElockError', () => {
    const err = new ConfigError('missing config');
    expect(err.message).toBe('missing config');
    expect(err.name).toBe('ConfigError');
    expect(err).toBeInstanceOf(ElockError);
  });
});
