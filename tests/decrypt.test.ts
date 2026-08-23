import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenError, RedisError } from '../src/types.js';
import { encrypt } from '../src/crypto.js';
import { encode } from '../src/token.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRetrieve = vi.fn();
vi.mock('../src/redis.js', () => ({
  retrieve: (...args: unknown[]) => mockRetrieve(...args),
}));

const mockAccess = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
vi.mock('node:fs/promises', () => ({
  access: (...args: unknown[]) => mockAccess(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

const mockPromptNewKeys = vi.fn();
const mockPromptChangedKeys = vi.fn();
vi.mock('../src/prompts.js', () => ({
  promptNewKeys: (...args: unknown[]) => mockPromptNewKeys(...args),
  promptChangedKeys: (...args: unknown[]) => mockPromptChangedKeys(...args),
}));

import { decryptCommand } from '../src/commands/decrypt.js';

// ─── Test Fixtures ────────────────────────────────────────────────────────────

// Create a valid token by encrypting known content and encoding the ID + key
const testPlaintext = 'API_KEY=secret123\nDB_HOST=localhost';
const { blob: testBlob, key: testKey } = encrypt(testPlaintext);
const testId = Buffer.alloc(4);  // 4-byte ID
const validToken = encode(testId, testKey);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('decryptCommand', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('token validation', () => {
    it('throws TokenError for invalid token (wrong prefix)', async () => {
      await expect(
        decryptCommand('invalid_token_string', {})
      ).rejects.toThrow(TokenError);
    });

    it('throws TokenError for token with empty body', async () => {
      await expect(
        decryptCommand('envlock_', {})
      ).rejects.toThrow(TokenError);
    });
  });

  describe('Redis retrieval errors', () => {
    it('throws RedisError when retrieve returns null (key not found/expired)', async () => {
      mockRetrieve.mockRejectedValue(new RedisError('Key not found or expired'));

      await expect(
        decryptCommand(validToken, {})
      ).rejects.toThrow(RedisError);
    });

    it('throws RedisError when retrieve throws connection error', async () => {
      mockRetrieve.mockRejectedValue(new RedisError('Connection failed'));

      await expect(
        decryptCommand(validToken, {})
      ).rejects.toThrow(RedisError);
    });
  });

  describe('mutually exclusive flags', () => {
    it('throws Error when --status and --replace are both set', async () => {
      await expect(
        decryptCommand(validToken, { status: true, replace: true })
      ).rejects.toThrow('--status and --replace are mutually exclusive');
    });
  });

  describe('--status with no existing .env', () => {
    it('prints new keys to stdout', async () => {
      mockRetrieve.mockResolvedValue(testBlob);
      // access throws → file does not exist
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      await decryptCommand(validToken, { status: true });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('New keys'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('API_KEY=secret123'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('DB_HOST=localhost'));
    });
  });

  describe('--status with existing .env', () => {
    it('prints categorized diff (new, changed, unchanged)', async () => {
      mockRetrieve.mockResolvedValue(testBlob);
      // access succeeds → file exists
      mockAccess.mockResolvedValue(undefined);
      // Existing .env has DB_HOST with different value and is missing API_KEY
      mockReadFile.mockResolvedValue('DB_HOST=oldhost\nOTHER=val');

      await decryptCommand(validToken, { status: true });

      // Should show API_KEY as new
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('New keys'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('API_KEY=secret123'));
      // Should show DB_HOST as changed
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Changed keys'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('DB_HOST'));
      // Should show unchanged count
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unchanged keys'));
    });
  });

  describe('--replace with existing .env', () => {
    it('overwrites existing .env with decrypted content', async () => {
      mockRetrieve.mockResolvedValue(testBlob);
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('OLD_KEY=oldvalue');
      mockWriteFile.mockResolvedValue(undefined);

      await decryptCommand(validToken, { replace: true });

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.any(String),
        testPlaintext,
        'utf-8'
      );
      expect(consoleSpy).toHaveBeenCalledWith('Replaced .env');
    });
  });

  describe('no existing .env file', () => {
    it('creates .env with decrypted content', async () => {
      mockRetrieve.mockResolvedValue(testBlob);
      // access throws → file does not exist
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockWriteFile.mockResolvedValue(undefined);

      await decryptCommand(validToken, {});

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.any(String),
        testPlaintext,
        'utf-8'
      );
      expect(consoleSpy).toHaveBeenCalledWith('Created .env');
    });
  });

  describe('merge flow', () => {
    it('calls prompts and writes merged result', async () => {
      mockRetrieve.mockResolvedValue(testBlob);
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('DB_HOST=oldhost\nOTHER=val');
      mockWriteFile.mockResolvedValue(undefined);

      // Accept all new keys, accept all changed keys
      mockPromptNewKeys.mockImplementation((keys) => Promise.resolve(keys));
      mockPromptChangedKeys.mockImplementation((keys) => Promise.resolve(keys));

      await decryptCommand(validToken, {});

      // Prompts should have been called with the diff results
      expect(mockPromptNewKeys).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ key: 'API_KEY', value: 'secret123' }),
        ])
      );
      expect(mockPromptChangedKeys).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ key: 'DB_HOST', currentValue: 'oldhost', newValue: 'localhost' }),
        ])
      );

      // writeFile should have been called with merged content
      expect(mockWriteFile).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('Merged .env updated');
    });
  });
});
