import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileError, RedisError } from '../src/types.js';

// Mock node:fs/promises
const mockReadFile = vi.fn();
vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

// Mock ../src/redis.js
const mockStore = vi.fn();
vi.mock('../src/redis.js', () => ({
  store: (...args: unknown[]) => mockStore(...args),
}));

import { encryptCommand } from '../src/commands/encrypt.js';

describe('encrypt command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('default path resolution', () => {
    it('reads .env from cwd when no path argument is provided', async () => {
      mockReadFile.mockResolvedValue('KEY=value');
      mockStore.mockResolvedValue(undefined);

      await encryptCommand();

      expect(mockReadFile).toHaveBeenCalledTimes(1);
      const calledPath = mockReadFile.mock.calls[0][0] as string;
      expect(calledPath).toMatch(/[/\\]\.env$/);
      expect(mockReadFile.mock.calls[0][1]).toBe('utf-8');
    });
  });

  describe('explicit path', () => {
    it('reads the specified file when path argument is provided', async () => {
      mockReadFile.mockResolvedValue('SECRET=123');
      mockStore.mockResolvedValue(undefined);

      await encryptCommand('custom.env');

      expect(mockReadFile).toHaveBeenCalledTimes(1);
      const calledPath = mockReadFile.mock.calls[0][0] as string;
      expect(calledPath).toMatch(/[/\\]custom\.env$/);
      expect(mockReadFile.mock.calls[0][1]).toBe('utf-8');
    });
  });

  describe('file not found', () => {
    it('throws FileError when file does not exist', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      await expect(encryptCommand('missing.env')).rejects.toThrow(FileError);
      await expect(encryptCommand('missing.env')).rejects.toThrow(
        /File not found or not accessible/
      );
    });
  });

  describe('Redis failure', () => {
    it('throws RedisError when store fails', async () => {
      mockReadFile.mockResolvedValue('DB_PASSWORD=super_secret_pass\nAPI_KEY=sk_live_abc123');
      mockStore.mockRejectedValue(new Error('Connection refused'));

      await expect(encryptCommand()).rejects.toThrow(RedisError);
    });

    it('does not reveal file content or key material in Redis error', async () => {
      const secretContent = 'DB_PASSWORD=super_secret_pass\nAPI_KEY=sk_live_abc123';
      mockReadFile.mockResolvedValue(secretContent);
      mockStore.mockRejectedValue(new Error('Connection refused'));

      try {
        await encryptCommand();
      } catch (err) {
        const error = err as Error;
        expect(error.message).not.toContain('super_secret_pass');
        expect(error.message).not.toContain('sk_live_abc123');
        expect(error.message).not.toContain('DB_PASSWORD');
        expect(error.message).not.toContain('API_KEY');
      }
    });

    it('re-throws RedisError as-is if store throws a RedisError', async () => {
      mockReadFile.mockResolvedValue('KEY=value');
      mockStore.mockRejectedValue(new RedisError('Custom redis error'));

      await expect(encryptCommand()).rejects.toThrow(RedisError);
      await expect(encryptCommand()).rejects.toThrow('Custom redis error');
    });
  });

  describe('successful encryption', () => {
    it('prints a token with envlock_ prefix to stdout', async () => {
      mockReadFile.mockResolvedValue('APP_SECRET=hello');
      mockStore.mockResolvedValue(undefined);

      await encryptCommand();

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toMatch(/^envlock_/);
    });

    it('prints a token with dash-separated 4-character chunks', async () => {
      mockReadFile.mockResolvedValue('KEY=value');
      mockStore.mockResolvedValue(undefined);

      await encryptCommand();

      const output = consoleSpy.mock.calls[0][0] as string;
      const tokenPart = output.slice('envlock_'.length);
      const chunks = tokenPart.split('-');
      for (const chunk of chunks) {
        expect(chunk).toHaveLength(4);
      }
    });

    it('calls store with a hex ID and ciphertext blob', async () => {
      mockReadFile.mockResolvedValue('DATA=test');
      mockStore.mockResolvedValue(undefined);

      await encryptCommand();

      expect(mockStore).toHaveBeenCalledTimes(1);
      const [id, blob] = mockStore.mock.calls[0];
      // ID should be a hex string (4 random bytes = 8 hex chars)
      expect(id).toMatch(/^[0-9a-f]{8}$/);
      // Blob should have the required ciphertext fields
      expect(blob).toHaveProperty('ciphertext');
      expect(blob).toHaveProperty('iv');
      expect(blob).toHaveProperty('authTag');
      expect(typeof blob.ciphertext).toBe('string');
      expect(typeof blob.iv).toBe('string');
      expect(typeof blob.authTag).toBe('string');
    });
  });
});
