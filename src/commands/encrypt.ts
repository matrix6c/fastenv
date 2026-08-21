import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { encrypt } from '../crypto.js';
import { encode, ID_LENGTH } from '../token.js';
import { store } from '../redis.js';
import { FileError, RedisError, ConfigError, FastenvError } from '../types.js';

/**
 * Parses a duration string like "5m", "30s", "2h" into seconds.
 * Supported suffixes: s (seconds), m (minutes), h (hours).
 * @throws Error if format is invalid
 */
export function parseDuration(input: string): number {
  const match = input.match(/^(\d+)\s*([smh])$/i);
  if (!match) {
    throw new FastenvError(`Invalid duration format: "${input}". Use a number followed by s, m, or h (e.g. 5m, 30s, 2h)`);
  }

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's': return amount;
    case 'm': return amount * 60;
    case 'h': return amount * 3600;
    default: throw new FastenvError(`Invalid duration unit: ${unit}`);
  }
}

export async function encryptCommand(filePath?: string, expiry?: number): Promise<void> {
  const target = resolve(filePath ?? '.env');

  let content: string;
  try {
    content = await readFile(target, 'utf-8');
  } catch {
    throw new FileError(`File not found or not accessible: ${target}`);
  }

  const { blob, key } = encrypt(content);

  const id = randomBytes(ID_LENGTH);
  const token = encode(id, key);

  const idHex = id.toString('hex');
  try {
    await store(idHex, blob, expiry);
  } catch (err) {
    if (err instanceof FastenvError) throw err;
    throw new RedisError('Failed to upload encrypted data to Redis');
  }

  console.log(token);
}
