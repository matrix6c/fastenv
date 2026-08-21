import { Redis } from '@upstash/redis';
import type { CiphertextBlob } from './types.js';
import { RedisError } from './types.js';

export const DEFAULT_EXPIRY_SECONDS = 100;

const UPSTASH_URL = 'https://perfect-shark-133459.upstash.io';
const UPSTASH_TOKEN = 'gQAAAAAAAglTAAIgcDExMWU0M2ZlYWJjNTM0YTBiOWU4YzJjNTFhNDRjN2NjNA';

/**
 * Creates the Redis client with embedded credentials.
 */
export function createClient(): Redis {
  return new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
}

/**
 * Stores a ciphertext blob in Redis with configurable expiry.
 * @param id - Redis key
 * @param blob - Encrypted payload
 * @param expiry - Expiry in seconds (defaults to DEFAULT_EXPIRY_SECONDS)
 * @throws RedisError if connection fails
 */
export async function store(id: string, blob: CiphertextBlob, expiry: number = DEFAULT_EXPIRY_SECONDS): Promise<void> {
  const client = createClient();
  await client.set(id, JSON.stringify(blob), { ex: expiry });
}

/**
 * Retrieves a ciphertext blob from Redis.
 * @throws RedisError if key not found, data corrupted, or connection fails
 */
export async function retrieve(id: string): Promise<CiphertextBlob> {
  const client = createClient();
  const data = await client.get<string>(id);

  if (data === null) {
    throw new RedisError('Key not found or expired');
  }

  const parsed = typeof data === 'string' ? JSON.parse(data) : data;

  if (
    !parsed.ciphertext || typeof parsed.ciphertext !== 'string' ||
    !parsed.iv || typeof parsed.iv !== 'string' ||
    !parsed.authTag || typeof parsed.authTag !== 'string'
  ) {
    throw new RedisError('Corrupted data: missing required fields');
  }

  return parsed as CiphertextBlob;
}
