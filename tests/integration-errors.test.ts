import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TokenError, RedisError, ConfigError } from '../src/types.js';
import { encode } from '../src/token.js';

// Mock Redis
const mockSet = vi.fn();
const mockGet = vi.fn();
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    set: mockSet,
    get: mockGet,
  })),
}));

import { encryptCommand } from '../src/commands/encrypt.js';
import { decryptCommand } from '../src/commands/decrypt.js';

describe('Integration: error paths', () => {
  let tempDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'elock-err-'));
    process.env = { ...originalEnv, UPSTASH_REDIS_REST_URL: 'https://test.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'test-token' };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('invalid token produces TokenError', async () => {
    await expect(decryptCommand('not_a_valid_token', {})).rejects.toThrow(TokenError);
  });

  it('expired key (Redis returns null) produces RedisError', async () => {
    const validToken = encode(Buffer.alloc(8), Buffer.alloc(32));
    mockGet.mockResolvedValue(null);

    await expect(decryptCommand(validToken, {})).rejects.toThrow(RedisError);
    await expect(decryptCommand(validToken, {})).rejects.toThrow(/not found or expired/i);
  });

  it('missing environment variables produces ConfigError', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const envFile = join(tempDir, '.env');
    writeFileSync(envFile, 'KEY=value');

    await expect(encryptCommand(envFile)).rejects.toThrow(ConfigError);
  });
});
