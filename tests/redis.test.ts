import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigError, RedisError } from '../src/types.js';

// Mock @upstash/redis
const mockSet = vi.fn();
const mockGet = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    set: mockSet,
    get: mockGet,
  })),
}));

import { createClient, store, retrieve } from '../src/redis.js';

describe('redis module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createClient', () => {
    it('throws ConfigError when UPSTASH_REDIS_REST_URL is missing', () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      process.env.UPSTASH_REDIS_REST_TOKEN = 'some-token';

      expect(() => createClient()).toThrow(ConfigError);
      expect(() => createClient()).toThrow('Missing environment variable: UPSTASH_REDIS_REST_URL');
    });

    it('throws ConfigError when UPSTASH_REDIS_REST_URL is empty', () => {
      process.env.UPSTASH_REDIS_REST_URL = '';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'some-token';

      expect(() => createClient()).toThrow(ConfigError);
      expect(() => createClient()).toThrow('Missing environment variable: UPSTASH_REDIS_REST_URL');
    });

    it('throws ConfigError when UPSTASH_REDIS_REST_TOKEN is missing', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      expect(() => createClient()).toThrow(ConfigError);
      expect(() => createClient()).toThrow('Missing environment variable: UPSTASH_REDIS_REST_TOKEN');
    });

    it('throws ConfigError when UPSTASH_REDIS_REST_TOKEN is empty', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = '';

      expect(() => createClient()).toThrow(ConfigError);
      expect(() => createClient()).toThrow('Missing environment variable: UPSTASH_REDIS_REST_TOKEN');
    });

    it('returns a Redis client when both env vars are set', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'valid-token';

      const client = createClient();
      expect(client).toBeDefined();
    });
  });

  describe('store', () => {
    beforeEach(() => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'valid-token';
    });

    it('stores blob as JSON with 24h expiry', async () => {
      mockSet.mockResolvedValue('OK');

      const blob = {
        ciphertext: 'encrypted-data',
        iv: 'initialization-vector',
        authTag: 'auth-tag-value',
      };

      await store('test-id', blob);

      expect(mockSet).toHaveBeenCalledWith(
        'test-id',
        JSON.stringify(blob),
        { ex: 86400 }
      );
    });
  });

  describe('retrieve', () => {
    beforeEach(() => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'valid-token';
    });

    it('throws RedisError when key is not found (null)', async () => {
      mockGet.mockResolvedValue(null);

      await expect(retrieve('missing-id')).rejects.toThrow(RedisError);
      await expect(retrieve('missing-id')).rejects.toThrow('Key not found or expired');
    });

    it('returns parsed CiphertextBlob when data is a valid JSON string', async () => {
      const blob = {
        ciphertext: 'encrypted-data',
        iv: 'initialization-vector',
        authTag: 'auth-tag-value',
      };
      mockGet.mockResolvedValue(JSON.stringify(blob));

      const result = await retrieve('valid-id');
      expect(result).toEqual(blob);
    });

    it('returns CiphertextBlob when data is already an object', async () => {
      const blob = {
        ciphertext: 'encrypted-data',
        iv: 'initialization-vector',
        authTag: 'auth-tag-value',
      };
      mockGet.mockResolvedValue(blob);

      const result = await retrieve('valid-id');
      expect(result).toEqual(blob);
    });

    it('throws RedisError when ciphertext is missing', async () => {
      mockGet.mockResolvedValue({ iv: 'iv', authTag: 'tag' });

      await expect(retrieve('bad-id')).rejects.toThrow(RedisError);
      await expect(retrieve('bad-id')).rejects.toThrow('Corrupted data: missing required fields');
    });

    it('throws RedisError when iv is missing', async () => {
      mockGet.mockResolvedValue({ ciphertext: 'data', authTag: 'tag' });

      await expect(retrieve('bad-id')).rejects.toThrow(RedisError);
      await expect(retrieve('bad-id')).rejects.toThrow('Corrupted data: missing required fields');
    });

    it('throws RedisError when authTag is missing', async () => {
      mockGet.mockResolvedValue({ ciphertext: 'data', iv: 'iv' });

      await expect(retrieve('bad-id')).rejects.toThrow(RedisError);
      await expect(retrieve('bad-id')).rejects.toThrow('Corrupted data: missing required fields');
    });

    it('throws RedisError when ciphertext is empty string', async () => {
      mockGet.mockResolvedValue({ ciphertext: '', iv: 'iv', authTag: 'tag' });

      await expect(retrieve('bad-id')).rejects.toThrow(RedisError);
      await expect(retrieve('bad-id')).rejects.toThrow('Corrupted data: missing required fields');
    });

    it('throws RedisError when a field is not a string', async () => {
      mockGet.mockResolvedValue({ ciphertext: 123, iv: 'iv', authTag: 'tag' });

      await expect(retrieve('bad-id')).rejects.toThrow(RedisError);
      await expect(retrieve('bad-id')).rejects.toThrow('Corrupted data: missing required fields');
    });
  });
});
