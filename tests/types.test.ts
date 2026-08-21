import { describe, it, expect } from 'vitest';
import {
  FastenvError,
  FileError,
  TokenError,
  RedisError,
  CryptoError,
  ConfigError,
} from '../src/types.js';

describe('Custom Error Classes', () => {
  it('FastenvError sets name and message correctly', () => {
    const err = new FastenvError('base error');
    expect(err.message).toBe('base error');
    expect(err.name).toBe('FastenvError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FastenvError);
  });

  it('FileError extends FastenvError', () => {
    const err = new FileError('file not found');
    expect(err.message).toBe('file not found');
    expect(err.name).toBe('FileError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FastenvError);
    expect(err).toBeInstanceOf(FileError);
  });

  it('TokenError extends FastenvError', () => {
    const err = new TokenError('invalid token');
    expect(err.message).toBe('invalid token');
    expect(err.name).toBe('TokenError');
    expect(err).toBeInstanceOf(FastenvError);
  });

  it('RedisError extends FastenvError', () => {
    const err = new RedisError('connection failed');
    expect(err.message).toBe('connection failed');
    expect(err.name).toBe('RedisError');
    expect(err).toBeInstanceOf(FastenvError);
  });

  it('CryptoError extends FastenvError', () => {
    const err = new CryptoError('decryption failed');
    expect(err.message).toBe('decryption failed');
    expect(err.name).toBe('CryptoError');
    expect(err).toBeInstanceOf(FastenvError);
  });

  it('ConfigError extends FastenvError', () => {
    const err = new ConfigError('missing config');
    expect(err.message).toBe('missing config');
    expect(err.name).toBe('ConfigError');
    expect(err).toBeInstanceOf(FastenvError);
  });
});
