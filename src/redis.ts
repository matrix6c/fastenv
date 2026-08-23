import { Redis } from '@upstash/redis';
import type { CiphertextBlob } from './types.js';
import { RedisError } from './types.js';

export const DEFAULT_EXPIRY_SECONDS = 100;

/**
 * Creates the Redis client using environment variables.
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to be set.
 */
export function createClient(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new RedisError(
      'Missing environment variables: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set'
    );
  }

  return new Redis({ url, token });
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
  