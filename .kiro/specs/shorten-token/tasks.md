# Implementation Plan: Shorten Token Format

## Overview

Reduce the elock token from 16 chunks to 8 chunks by switching to AES-128-GCM (16-byte key) and 4-byte ID.

## Tasks

- [x] 1. Update core source modules
  - [x] 1.1 Update `src/crypto.ts` to use AES-128 with named constants
    - Add exported constant `KEY_LENGTH = 16`
    - Change `randomBytes(32)` to `randomBytes(KEY_LENGTH)` in `encrypt()`
    - Change `'aes-256-gcm'` to `'aes-128-gcm'` in both `createCipheriv` and `createDecipheriv`
    - _Requirements: FR-1, FR-2, FR-7_

  - [x] 1.2 Update `src/token.ts` to use 20-byte payload with named constants
    - Add exported constants `ID_LENGTH = 4` and `TOTAL_LENGTH = 20`
    - Update `encode()` doc comment to reflect 4-byte ID + 16-byte key = 20 bytes
    - Update `decode()` to validate `bytes.length !== 20` and split at byte 4 (`id = bytes.subarray(0, 4)`, `secretKey = bytes.subarray(4, 20)`)
    - Update error message to say "expected 20 bytes after decoding"
    - _Requirements: FR-4, FR-5, FR-6, FR-7_

  - [x] 1.3 Update `src/commands/encrypt.ts` to use 4-byte ID
    - Import `ID_LENGTH` from `'../token.js'`
    - Change `randomBytes(8)` to `randomBytes(ID_LENGTH)`
    - _Requirements: FR-3, FR-7_

- [x] 2. Update all tests to reflect new byte sizes
  - [x] 2.1 Update `tests/crypto.test.ts` and `tests/crypto.property.test.ts`
    - Update any assertions on key length from 32 to 16
    - Update any references to AES-256 in comments/descriptions to AES-128
    - Ensure property tests generate 16-byte keys for round-trip testing
    - _Requirements: NFR-3_

  - [x] 2.2 Update `tests/token.test.ts` and `tests/token.property.test.ts`
    - Update ID buffer size from 8 to 4 bytes in test fixtures
    - Update secret key buffer size from 32 to 16 bytes in test fixtures
    - Update expected decoded total length from 40 to 20 bytes
    - Update chunk count assertions from 16 to 8 where applicable
    - Update property test generators to use 4-byte ID and 16-byte key
    - _Requirements: NFR-3_

  - [x] 2.3 Update `tests/encrypt.test.ts` and `tests/decrypt.test.ts`
    - Update any hardcoded token generation to use 4-byte ID and 16-byte key
    - Update ID hex length assertions from 16 chars to 8 chars
    - Update token format expectations
    - _Requirements: NFR-3_

  - [x] 2.4 Update `tests/integration.test.ts`, `tests/integration-merge.test.ts`, and `tests/integration-errors.test.ts`
    - Update any hardcoded tokens or token generation to use new sizes
    - Update token format pattern assertions if any
    - _Requirements: NFR-3_

- [x] 3. Verify all tests pass
  - [x] 3.1 Run full test suite and fix any remaining failures
    - Run `npx vitest run` and ensure all tests pass
    - Fix any missed size references
    - _Requirements: NFR-3_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "id": 2, "tasks": ["3.1"] }
  ]
}
```
