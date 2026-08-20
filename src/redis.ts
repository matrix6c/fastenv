import 'dotenv/config';
import { Redis } from '@upstash/redis';
import type { CiphertextBlob } from './types.js';
import { ConfigError, RedisError } from './types.js';

const EXPIRY_SECONDS = 86400;

/**
 * Creates and validates the Redis client from environment variables.
 * @throws ConfigError if UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set
 */
export function createClient(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url) {
    throw new ConfigError('Missing environment variable: UPSTASH_REDIS_REST_URL');
  }
  if (!token) {
    throw new ConfigError('Missing environment variable: UPSTASH_REDIS_REST_TOKEN');
  }

  return new Redis({ url, token });
}

/**
 * Stores a ciphertext blob in Redis with 24h expiry.
 * @throws RedisError if connection fails
 */
export async function store(id: string, blob: CiphertextBlob): Promise<void> {
  const client = createClient();
  await client.set(id, JSON.stringify(blob), { ex: EXPIRY_SECONDS });
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
