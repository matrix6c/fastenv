import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decrypt } from '../crypto.js';
import { decode } from '../token.js';
import { retrieve } from '../redis.js';
import { parse, toMap } from '../parseEnv.js';
import { diff, applyMerge } from '../diffMerge.js';
import { promptNewKeys, promptChangedKeys } from '../prompts.js';
import { FileError } from '../types.js';

export interface DecryptOptions {
  status?: boolean;
  replace?: boolean;
}

/**
 * Decrypt command handler.
 * Decodes the shareable token, retrieves the ciphertext blob from Redis,
 * decrypts content, and applies it to the local .env file based on flags.
 */
export async function decryptCommand(key: string, options: DecryptOptions): Promise<void> {
  // Validate mutually exclusive flags
  if (options.status && options.replace) {
    throw new Error('--status and --replace are mutually exclusive');
  }

  // Decode token (throws TokenError if invalid)
  const { id, secretKey } = decode(key);
  const idHex = id.toString('hex');

  // Retrieve from Redis (throws RedisError if not found/expired)
  const blob = await retrieve(idHex);

  // Decrypt (throws CryptoError if auth fails)
  const plaintext = decrypt(blob, secretKey).toString('utf-8');

  const envPath = resolve('.env');
  let existingContent: string | null = null;

  try {
    await access(envPath);
    existingContent = await readFile(envPath, 'utf-8');
  } catch {
    // File doesn't exist
  }

  // --status with no existing file: show all keys as new
  if (options.status && existingContent === null) {
    const entries = parse(plaintext);
    const map = toMap(entries);
    console.log(`New keys (${map.size}):`);
    for (const [k, v] of map) console.log(`  ${k}=${v}`);
    return;
  }

  // --replace or no existing file: write directly
  if (options.replace || existingContent === null) {
    try {
      await writeFile(envPath, plaintext, 'utf-8');
    } catch {
      throw new FileError('Failed to write .env file');
    }
    console.log(existingContent === null ? 'Created .env' : 'Replaced .env');
    return;
  }

  // Merge flow: existing file exists and neither --replace nor --status alone triggers direct write
  const existingEntries = parse(existingContent);
  const incomingEntries = parse(plaintext);
  const existingMap = toMap(existingEntries);
  const incomingMap = toMap(incomingEntries);
  const result = diff(existingMap, incomingMap);

  if (options.status) {
    console.log(`New keys (${result.newKeys.length}):`);
    result.newKeys.forEach((k) => console.log(`  ${k.key}=${k.value}`));
    console.log(`Changed keys (${result.changedKeys.length}):`);
    result.changedKeys.forEach((k) => console.log(`  ${k.key}: ${k.currentValue} → ${k.newValue}`));
    console.log(`Unchanged keys (${result.unchangedKeys.length})`);
    return;
  }

  // Interactive merge
  const acceptedNew = await promptNewKeys(result.newKeys);
  const acceptedChanges = await promptChangedKeys(result.changedKeys);
  const merged = applyMerge(existingEntries, acceptedNew, acceptedChanges);

  try {
    await writeFile(envPath, merged, 'utf-8');
  } catch {
    throw new FileError('Failed to write .env file');
  }

  console.log('Merged .env updated');
}
