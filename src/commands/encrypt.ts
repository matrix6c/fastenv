import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { encrypt } from '../crypto.js';
import { encode } from '../token.js';
import { store } from '../redis.js';
import { FileError, RedisError, ConfigError, ElockError } from '../types.js';

export async function encryptCommand(filePath?: string): Promise<void> {
  const target = resolve(filePath ?? '.env');

  let content: string;
  try {
    content = await readFile(target, 'utf-8');
  } catch {
    throw new FileError(`File not found or not accessible: ${target}`);
  }

  const { blob, key } = encrypt(content);

  const id = randomBytes(8);
  const token = encode(id, key);

  const idHex = id.toString('hex');
  try {
    await store(idHex, blob);
  } catch (err) {
    if (err instanceof ElockError) throw err;
    throw new RedisError('Failed to upload encrypted data to Redis');
  }

  console.log(token);
}
