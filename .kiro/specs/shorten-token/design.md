# Design: Shorten Token Format

## Overview

Reduce token length from 16 chunks to 8 chunks by switching from AES-256-GCM (32-byte key + 8-byte ID = 40 bytes) to AES-128-GCM (16-byte key + 4-byte ID = 20 bytes).

## Changes

### `src/crypto.ts`
- Change `randomBytes(32)` → `randomBytes(16)` for key generation
- Change `'aes-256-gcm'` → `'aes-128-gcm'` in both `createCipheriv` and `createDecipheriv`
- Export `KEY_LENGTH = 16` constant

### `src/token.ts`
- Export `ID_LENGTH = 4` and `TOTAL_LENGTH = 20` constants
- Update `encode()` comment: expects 4-byte ID + 16-byte key = 20 bytes
- Update `decode()`: validate decoded length is 20 bytes, split at byte 4

### `src/commands/encrypt.ts`
- Change `randomBytes(8)` → `randomBytes(4)` for ID generation (use `ID_LENGTH` from token module)

### Tests
- Update all tests that assert on key length (32 → 16), ID length (8 → 4), decoded total (40 → 20), or token chunk count (16 → 8)
