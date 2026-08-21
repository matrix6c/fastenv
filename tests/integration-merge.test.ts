import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encrypt } from '../src/crypto.js';
import { encode } from '../src/token.js';
import { randomBytes } from 'node:crypto';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockStore = vi.fn();
const mockRetrieve = vi.fn();
vi.mock('../src/redis.js', () => ({
  store: (...args: unknown[]) => mockStore(...args),
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

vi.mock('../src/prompts.js', () => ({
  promptNewKeys: (keys: unknown[]) => Promise.resolve(keys),
  promptChangedKeys: (keys: unknown[]) => Promise.resolve(keys),
}));

import { encryptCommand } from '../src/commands/encrypt.js';
import { decryptCommand } from '../src/commands/decrypt.js';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Integration: merge workflow', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('merges decrypted content into existing .env preserving structure', async () => {
    // ─── Step 1: Encrypt a partial .env with some keys ─────────────────────
    const incomingContent = 'A=1\nB=new_val\nC=3';
    mockReadFile.mockResolvedValueOnce(incomingContent);
    mockStore.mockResolvedValueOnce(undefined);

    await encryptCommand('incoming.env');

    // Capture the token printed to stdout
    const token = consoleSpy.mock.calls[0][0] as string;
    expect(token).toMatch(/^envlock_/);

    // Capture what was stored in Redis
    const [storedId, storedBlob] = mockStore.mock.calls[0];
    expect(storedBlob).toHaveProperty('ciphertext');
    expect(storedBlob).toHaveProperty('iv');
    expect(storedBlob).toHaveProperty('authTag');

    consoleSpy.mockClear();

    // ─── Step 2: Set up existing .env with overlapping and different keys ──
    const existingEnvContent = '# header\nA=1\nB=old_val\nD=local_only';

    // Mock retrieve to return the stored blob
    mockRetrieve.mockResolvedValueOnce(storedBlob);
    // Mock access to succeed (file exists)
    mockAccess.mockResolvedValueOnce(undefined);
    // Mock readFile to return the existing .env content
    mockReadFile.mockResolvedValueOnce(existingEnvContent);
    // Mock writeFile to capture the merged output
    mockWriteFile.mockResolvedValueOnce(undefined);

    // ─── Step 3: Decrypt with the token (prompts auto-accept all) ──────────
    await decryptCommand(token, {});

    // ─── Step 4: Verify the merged output ──────────────────────────────────
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const mergedOutput = mockWriteFile.mock.calls[0][1] as string;

    // Preserves the comment `# header`
    expect(mergedOutput).toContain('# header');

    // Preserves unchanged key A=1
    expect(mergedOutput).toContain('A=1');

    // Updates changed key B to new_val
    expect(mergedOutput).toContain('B=new_val');
    expect(mergedOutput).not.toContain('B=old_val');

    // Preserves local-only key D=local_only (not deleted)
    expect(mergedOutput).toContain('D=local_only');

    // Adds new key C=3 under the dated header
    expect(mergedOutput).toContain('C=3');
    expect(mergedOutput).toMatch(/# --- added by fastenv \d{4}-\d{2}-\d{2} ---/);

    // Verify the dated header appears before C=3
    const headerIndex = mergedOutput.indexOf('# --- added by fastenv');
    const cKeyIndex = mergedOutput.indexOf('C=3');
    expect(headerIndex).toBeLessThan(cKeyIndex);

    // Verify success message was logged
    expect(consoleSpy).toHaveBeenCalledWith('Merged .env updated');
  });

  it('preserves key ordering and structural elements in merge', async () => {
    // Encrypt content with keys that overlap differently
    const incomingContent = 'X=new_x\nY=updated_y\nZ=new_z';
    mockReadFile.mockResolvedValueOnce(incomingContent);
    mockStore.mockResolvedValueOnce(undefined);

    await encryptCommand('test.env');

    const token = consoleSpy.mock.calls[0][0] as string;
    const [, storedBlob] = mockStore.mock.calls[0];
    consoleSpy.mockClear();

    // Existing .env has comments, blank lines, and some overlapping keys
    const existingEnvContent = [
      '# Application Config',
      '',
      'Y=old_y',
      '# Database section',
      'DB_HOST=localhost',
      '',
    ].join('\n');

    mockRetrieve.mockResolvedValueOnce(storedBlob);
    mockAccess.mockResolvedValueOnce(undefined);
    mockReadFile.mockResolvedValueOnce(existingEnvContent);
    mockWriteFile.mockResolvedValueOnce(undefined);

    await decryptCommand(token, {});

    const mergedOutput = mockWriteFile.mock.calls[0][1] as string;

    // Preserves comments
    expect(mergedOutput).toContain('# Application Config');
    expect(mergedOutput).toContain('# Database section');

    // Preserves local-only key DB_HOST
    expect(mergedOutput).toContain('DB_HOST=localhost');

    // Updates Y in-place
    expect(mergedOutput).toContain('Y=updated_y');
    expect(mergedOutput).not.toContain('Y=old_y');

    // Adds new keys X and Z under fastenv header
    expect(mergedOutput).toContain('X=new_x');
    expect(mergedOutput).toContain('Z=new_z');
    expect(mergedOutput).toMatch(/# --- added by fastenv \d{4}-\d{2}-\d{2} ---/);

    // Verify structural ordering: comments and blank lines precede the keys
    const lines = mergedOutput.split('\n');
    const appConfigIdx = lines.findIndex(l => l === '# Application Config');
    const yIdx = lines.findIndex(l => l.startsWith('Y='));
    const dbSectionIdx = lines.findIndex(l => l === '# Database section');
    const dbHostIdx = lines.findIndex(l => l.startsWith('DB_HOST='));

    // Original ordering preserved
    expect(appConfigIdx).toBeLessThan(yIdx);
    expect(dbSectionIdx).toBeLessThan(dbHostIdx);
  });
});
