# Requirements: Shorten Token Format

## Functional Requirements

1. **FR-1**: The system MUST generate encryption keys of 16 bytes (AES-128) instead of 32 bytes (AES-256).
2. **FR-2**: The system MUST use `aes-128-gcm` as the cipher algorithm in both encrypt and decrypt operations.
3. **FR-3**: The system MUST generate random IDs of 4 bytes instead of 8 bytes.
4. **FR-4**: The token encode function MUST concatenate a 4-byte ID and 16-byte key (20 bytes total) before base32 encoding.
5. **FR-5**: The token decode function MUST expect 20 bytes after base32 decoding, splitting into 4-byte ID and 16-byte secretKey.
6. **FR-6**: The resulting token format MUST be `envlock_XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX` (8 dash-separated 4-character chunks).
7. **FR-7**: Named constants (`KEY_LENGTH = 16`, `ID_LENGTH = 4`, `TOTAL_LENGTH = 20`) MUST be used instead of magic numbers.

## Non-Functional Requirements

8. **NFR-1**: This is a clean break — old 16-chunk tokens are no longer valid.
9. **NFR-2**: The zero-knowledge architecture MUST be preserved (server never sees the key).
10. **NFR-3**: All existing tests MUST be updated to reflect the new byte sizes and pass.
