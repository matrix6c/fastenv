import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock @upstash/redis at the package level to capture store/retrieve calls
const mockSet = vi.fn().mockResolvedValue('OK');
const mockGet = vi.fn();
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    set: mockSet,
    get: mockGet,
  })),
}));

import { encryptCommand } from '../src/commands/encrypt.js';
import { decryptCommand } from '../src/commands/decrypt.js';

describe('Integration: encrypt/decrypt round-trip', () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  const originalEnv = process.env;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'elock-test-'));
    process.env = {
      ...originalEnv,
      UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'test-token',
    };
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('encrypts a .env file and decrypts back to original content', async () => {
    const envContent = 'DB_HOST=localhost\nDB_PORT=5432\nAPI_KEY=secret123';
    const envFile = join(tempDir, '.env');
    writeFileSync(envFile, envContent);

    // Encrypt
    await encryptCommand(envFile);

    // Capture token from stdout
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const token = consoleSpy.mock.calls[0][0] as string;
    expect(token).toMatch(/^envlock_/);

    // Verify token format: dash-separated 4-character chunks after prefix
    const tokenBody = token.slice('envlock_'.length);
    const chunks = tokenBody.split('-');
    for (const chunk of chunks) {
      expect(chunk).toHaveLength(4);
    }

    // Capture what was stored in Redis
    expect(mockSet).toHaveBeenCalledTimes(1);
    const [storedId, storedBlobJson, options] = mockSet.mock.calls[0];
    expect(typeof storedId).toBe('string');
    expect(storedId).toMatch(/^[0-9a-f]{16}$/);

    const storedBlob = JSON.parse(storedBlobJson);
    expect(storedBlob).toHaveProperty('ciphertext');
    expect(storedBlob).toHaveProperty('iv');
    expect(storedBlob).toHaveProperty('authTag');
    expect(typeof storedBlob.ciphertext).toBe('string');
    expect(typeof storedBlob.iv).toBe('string');
    expect(typeof storedBlob.authTag).toBe('string');
    expect(storedBlob.ciphertext.length).toBeGreaterThan(0);
    expect(storedBlob.iv.length).toBeGreaterThan(0);
    expect(storedBlob.authTag.length).toBeGreaterThan(0);

    // Verify expiry was set
    expect(options).toEqual({ ex: 86400 });

    // Set up mock for decrypt retrieval — return the stored blob as a string
    // (the retrieve function parses it from what Redis returns)
    mockGet.mockResolvedValue(storedBlobJson);
    consoleSpy.mockClear();

    // Change cwd to a new temp dir for decrypt (no existing .env)
    const decryptDir = mkdtempSync(join(tmpdir(), 'elock-decrypt-'));
    const originalCwd = process.cwd();
    process.chdir(decryptDir);

    try {
      await decryptCommand(token, {});

      // Verify file was created with original content
      const createdContent = readFileSync(join(decryptDir, '.env'), 'utf-8');
      expect(createdContent).toBe(envContent);
      expect(consoleSpy).toHaveBeenCalledWith('Created .env');
    } finally {
      process.chdir(originalCwd);
      rmSync(decryptDir, { recursive: true, force: true });
    }
  });
});
