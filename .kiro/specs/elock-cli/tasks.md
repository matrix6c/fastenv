# Implementation Plan: elock CLI

## Overview

Implement the elock CLI tool — a TypeScript Node.js application that encrypts .env files client-side using AES-256-GCM, uploads ciphertext to Upstash Redis with 24h expiry, and provides a shareable key for teammates to decrypt and merge secrets into their local .env files.

## Tasks

- [x] 1. Set up project structure and configuration
  - [x] 1.1 Initialize project with package.json, tsconfig.json, and vitest.config.ts
    - Create `package.json` with name, version, type "module", bin entry, scripts (build, dev, test), dependencies (`@upstash/redis`, `commander`, `inquirer`), and devDependencies (`@types/inquirer`, `@types/node`, `fast-check`, `tsx`, `typescript`, `vitest`)
    - Create `tsconfig.json` with target ES2022, module NodeNext, moduleResolution NodeNext, outDir ./dist, rootDir ., strict mode, and ESM settings
    - Create `vitest.config.ts` with globals enabled and test include pattern `tests/**/*.test.ts`
    - Create directory structure: `bin/`, `src/`, `src/commands/`, `tests/`
    - _Requirements: 9.4_

  - [x] 1.2 Create shared type definitions in `src/types.ts`
    - Define `EnvEntryType`, `QuoteStyle`, `EnvEntry`, `CiphertextBlob`, `EncryptResult`, `DecodedToken`, `NewKey`, `ChangedKey`, `UnchangedKey`, `DiffResult` types and interfaces
    - Define custom error classes: `ElockError`, `FileError`, `TokenError`, `RedisError`, `CryptoError`, `ConfigError`
    - _Requirements: 7.6, 7.7, 8.7_

- [x] 2. Implement crypto module
  - [x] 2.1 Implement `src/crypto.ts` with encrypt and decrypt functions
    - Implement `encrypt(plaintext: Buffer | string): EncryptResult` using `crypto.randomBytes(32)` for key, `crypto.randomBytes(12)` for IV, and `createCipheriv('aes-256-gcm', ...)` for encryption
    - Implement `decrypt(blob: CiphertextBlob, key: Buffer): Buffer` using `createDecipheriv('aes-256-gcm', ...)` with auth tag verification
    - Throw `CryptoError` on authentication failure without revealing key or plaintext
    - _Requirements: 1.3, 1.4, 2.3, 7.1, 7.2, 7.3, 7.6, 7.7_

  - [x] 2.2 Write property test for crypto round-trip
    - **Property 1: Crypto encrypt/decrypt round-trip**
    - **Validates: Requirements 1.4, 2.3, 7.3, 10.1**

  - [x] 2.3 Write unit tests for crypto module
    - Test encrypt/decrypt round-trip with empty buffer, 1 byte, and 10KB+ inputs
    - Test that decryption with an incorrect key throws an authentication error
    - Test that tampered ciphertext throws an authentication error
    - _Requirements: 10.1, 10.7_

- [x] 3. Implement token module
  - [x] 3.1 Implement `src/token.ts` with encode and decode functions
    - Define custom base32 alphabet `23456789ABCDEFGHJKLMNPQRSTVWXYZ` (excludes 0/O, 1/l/I)
    - Implement `base32Encode(buffer: Buffer): string` converting bytes to 5-bit chunks mapped to alphabet
    - Implement `base32Decode(encoded: string): Buffer` reversing the encoding
    - Implement `encode(id: Buffer, secretKey: Buffer): string` concatenating 8-byte ID + 32-byte key, encoding to base32, chunking into 4-char groups with dashes, and prepending `envlock_`
    - Implement `decode(token: string): DecodedToken` stripping prefix, normalizing case, removing dashes, decoding base32, and splitting into ID (8 bytes) and secretKey (32 bytes)
    - Throw `TokenError` for invalid format or wrong decoded length
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 3.2 Write property tests for token encode/decode
    - **Property 2: Token encode/decode round-trip**
    - **Validates: Requirements 5.3, 5.5, 5.7, 10.2**
    - **Property 3: Token case-insensitive decode**
    - **Validates: Requirements 5.6**

  - [x] 3.3 Write unit tests for token module
    - Test encode/decode with known values
    - Test invalid token format throws `TokenError`
    - Test case-insensitive decode produces same result
    - _Requirements: 10.2_

- [x] 4. Implement .env parser module
  - [x] 4.1 Implement `src/parseEnv.ts` with parse, stringify, and toMap functions
    - Implement `parse(content: string): EnvEntry[]` handling KEY=value (with optional `export` prefix), single-quoted values (literal, no escapes), double-quoted values (with escape sequences `\n`, `\r`, `\\`, `\"`), multi-line quoted values, unquoted values (trimmed), inline comments (whitespace + `#`), comment lines, blank lines, and unknown lines
    - Implement `stringify(entries: EnvEntry[]): string` joining entry `raw` fields with newlines
    - Implement `toMap(entries: EnvEntry[]): Map<string, string>` extracting key-value pairs
    - Handle whitespace around `=` sign in KEY=value lines
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

  - [x] 4.2 Write property test for parse/stringify round-trip
    - **Property 4: .env parse/stringify round-trip**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 6.9, 10.3**

  - [x] 4.3 Write unit tests for parseEnv module
    - Test single-quoted values strip outer quotes with no escape processing
    - Test double-quoted values strip outer quotes and interpret escape sequences
    - Test multi-line values preserve internal newlines
    - Test comment lines and blank lines are retained as structural elements
    - Test inline comments after whitespace+# are excluded from value
    - Test whitespace around `=` is handled correctly
    - Test unknown lines are preserved as-is
    - _Requirements: 10.3_

- [x] 5. Checkpoint - Core modules verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement diff/merge module
  - [x] 6.1 Implement `src/diffMerge.ts` with diff and applyMerge functions
    - Implement `diff(existing: Map<string, string>, incoming: Map<string, string>): DiffResult` categorizing keys into newKeys, changedKeys, unchangedKeys buckets using trimmed string comparison
    - Implement `applyMerge(existingEntries: EnvEntry[], acceptedNew: NewKey[], acceptedChanges: ChangedKey[]): string` updating changed values in-place, preserving structural elements, and appending new keys under a dated comment header `# --- added by elock <ISO-date> ---`
    - Implement `formatValue(value: string, quoteStyle: QuoteStyle): string` preserving original quote style
    - _Requirements: 4.1, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x] 6.2 Write property test for diff exhaustive partitioning
    - **Property 5: Diff exhaustive partitioning**
    - **Validates: Requirements 4.1, 10.4**

  - [x] 6.3 Write property test for merge structural preservation
    - **Property 6: Merge structural preservation**
    - **Validates: Requirements 4.5, 4.6, 4.8, 10.5**

  - [x] 6.4 Write unit tests for diffMerge module
    - Test all-new keys, all-changed, all-unchanged, and mixed scenarios
    - Test empty maps
    - Test trimmed comparison for changed/unchanged categorization
    - Test merge output preserves comments, blanks, and key ordering
    - Test accepted new keys appended at end under dated comment header
    - Test accepted changed values updated in-place
    - _Requirements: 10.4, 10.5_

- [x] 7. Implement Redis module
  - [x] 7.1 Implement `src/redis.ts` with createClient, store, and retrieve functions
    - Implement `createClient(): Redis` reading `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from environment, throwing `ConfigError` if either is missing or empty
    - Implement `store(id: string, blob: CiphertextBlob): Promise<void>` using `client.set()` with `{ ex: 86400 }`
    - Implement `retrieve(id: string): Promise<CiphertextBlob>` using `client.get()` with validation of required fields (ciphertext, iv, authTag as non-empty strings), throwing `RedisError` for not found/expired or corrupted data
    - _Requirements: 1.5, 1.6, 2.2, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 7.2 Write unit tests for Redis module
    - Test createClient throws ConfigError when env vars are missing
    - Test store calls SET with correct expiry
    - Test retrieve validates response fields
    - Test retrieve throws RedisError when key not found (null response)
    - Test retrieve throws RedisError when data is corrupted (missing fields)
    - Use vitest mocking for `@upstash/redis`
    - _Requirements: 8.3, 8.5, 8.6, 10.8_

- [x] 8. Implement interactive prompts module
  - [x] 8.1 Implement `src/prompts.ts` with promptNewKeys and promptChangedKeys functions
    - Implement `promptNewKeys(newKeys: NewKey[]): Promise<NewKey[]>` prompting user for each new key with `Add KEY=value? (y/n)` format, returning accepted keys
    - Implement `promptChangedKeys(changedKeys: ChangedKey[]): Promise<ChangedKey[]>` displaying current and new values, prompting `Overwrite KEY? (y/n)` with default false, returning accepted changes
    - Use dynamic `import('inquirer')` for ESM compatibility
    - _Requirements: 4.2, 4.3, 4.7_

- [x] 9. Implement encrypt command
  - [x] 9.1 Implement `src/commands/encrypt.ts` command handler
    - Implement `encryptCommand(filePath?: string): Promise<void>` that resolves path (default `.env`), reads file content, encrypts with `encrypt()`, generates 8-byte random ID, encodes token with `encode(id, key)`, stores blob in Redis with `store(idHex, blob)`, and prints the token to stdout
    - Handle file-not-found with `FileError`, Redis failures with `RedisError`
    - Never modify or delete the input file
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

  - [x] 9.2 Write unit tests for encrypt command
    - Test default path resolution reads `.env` from cwd
    - Test explicit path reads the specified file
    - Test file-not-found produces correct error
    - Test Redis failure produces error without revealing secrets
    - Mock filesystem and Redis interactions
    - _Requirements: 1.1, 1.2, 1.8, 1.9_

- [x] 10. Implement decrypt command
  - [x] 10.1 Implement `src/commands/decrypt.ts` command handler
    - Implement `decryptCommand(key: string, options: DecryptOptions): Promise<void>` with full flow: validate mutually exclusive flags, decode token, retrieve blob from Redis, decrypt content, handle no-file/replace/dry-run/merge paths
    - For `--dry-run`: print categorized diff without writing to disk
    - For `--replace` or no existing .env: write decrypted content directly
    - For merge flow: parse both files, compute diff, prompt user, apply merge, write result
    - Handle all error cases with appropriate typed errors
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 10.2 Write unit tests for decrypt command
    - Test missing key argument produces error
    - Test invalid token format produces error
    - Test expired/not-found key produces error
    - Test `--dry-run` output format with and without existing .env
    - Test `--replace` overwrites existing .env
    - Test mutually exclusive flags produce error
    - Test merge flow integration with mocked prompts
    - Mock Redis and inquirer interactions
    - _Requirements: 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.1, 3.2, 3.3, 3.5_

- [x] 11. Checkpoint - Commands implemented
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement CLI entry point and wiring
  - [x] 12.1 Implement `bin/elock.ts` CLI entry point with commander
    - Set up `commander` program with name, description, and version from package.json
    - Register `encrypt [path]` command wired to `encryptCommand`
    - Register `decrypt <key>` command with `--dry-run` and `--replace` options wired to `decryptCommand`
    - Add top-level error handler that catches `ElockError` subclasses, prints message to stderr, and exits with appropriate code
    - Handle unrecognized commands with error message and usage info
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 12.2 Install dependencies and verify build
    - Run `npm install` to install all dependencies
    - Run `npm run build` to verify TypeScript compilation succeeds
    - Verify the `dist/bin/elock.js` entry point is generated correctly
    - _Requirements: 9.1, 9.2_

- [x] 13. Write integration tests
  - [x] 13.1 Write integration test for full encrypt/decrypt round-trip
    - Operate in a temporary directory with mocked `@upstash/redis` client
    - Encrypt a .env file, verify token format matches `envlock_XXXX-XXXX-...`
    - Verify mocked Redis receives a CiphertextBlob with required fields
    - Decrypt with produced token, verify recovered content matches original
    - _Requirements: 10.6_

  - [x] 13.2 Write integration test for merge workflow
    - Encrypt a partial .env file, decrypt into existing .env
    - Mock user accepting all prompts
    - Verify merged output contains accepted new keys and updated changed keys without corrupting unrelated keys
    - _Requirements: 10.6_

  - [x] 13.3 Write integration tests for error paths
    - Test invalid token produces clean error
    - Test expired key (Redis returns null) produces error on stderr with non-zero exit
    - Test missing environment variables produces config error
    - _Requirements: 10.7, 10.8_

- [x] 14. Final checkpoint - All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All code uses TypeScript with ESM (`.js` extensions in imports)
- Redis interactions should be mocked in all tests — no live Redis required for test suite

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.2", "3.3", "4.2", "4.3", "6.1", "7.1", "8.1"] },
    { "id": 4, "tasks": ["6.2", "6.3", "6.4", "7.2"] },
    { "id": 5, "tasks": ["9.1", "10.1"] },
    { "id": 6, "tasks": ["9.2", "10.2", "12.1"] },
    { "id": 7, "tasks": ["12.2"] },
    { "id": 8, "tasks": ["13.1", "13.2", "13.3"] }
  ]
}
```
