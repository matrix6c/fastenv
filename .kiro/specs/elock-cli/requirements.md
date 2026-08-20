# Requirements Document

## Introduction

elock is a Node.js CLI tool distributed as an npm package that solves the problem of insecure .env file sharing among developers. It encrypts a .env file client-side using AES-256-GCM, uploads the ciphertext to Upstash Redis with a 24-hour expiry, and returns a single shareable key. A teammate uses that key to fetch, decrypt, and intelligently merge the secrets into their local .env file. All encryption and decryption happens client-side — Upstash Redis only stores opaque ciphertext blobs.

## Glossary

- **CLI**: The elock command-line interface application
- **Shareable_Key**: A string in the format `envlock_XXXX-XXXX-XXXX-XXXX` encoding both a Redis lookup ID and an AES-256-GCM decryption key
- **Token**: The portion of the Shareable_Key after the `envlock_` prefix, composed of dash-separated 4-character chunks using a base32 or base58 alphabet
- **ID_Portion**: The segment of the Token used to look up the ciphertext blob in Redis
- **Secret_Key_Portion**: The segment of the Token used for client-side AES-256-GCM decryption, never transmitted to Redis
- **Ciphertext_Blob**: A JSON object containing the encrypted data, initialization vector, and authentication tag stored in Redis
- **Env_File**: A file containing environment variable definitions in KEY=value format with support for comments, blank lines, quoted values, and multi-line values
- **Merge_Flow**: The interactive process of reconciling decrypted keys with an existing Env_File
- **Crypto_Module**: Node.js built-in `crypto` module used for all cryptographic operations
- **Upstash_Redis**: The remote Redis-compatible key-value store accessed via `@upstash/redis` package
- **Parser**: The component that reads and interprets Env_File content into structured key-value pairs while preserving comments and formatting
- **Pretty_Printer**: The component that serializes structured key-value pairs back into valid Env_File format preserving original formatting

## Requirements

### Requirement 1: Encrypt Command

**User Story:** As a developer, I want to encrypt my .env file and get a shareable key, so that I can securely share secrets with teammates.

#### Acceptance Criteria

1. WHEN the user runs `elock encrypt` without a path argument, THE CLI SHALL read the `.env` file in the current working directory
2. WHEN the user runs `elock encrypt <path>`, THE CLI SHALL read the file at the specified path
3. WHEN the input file is read successfully, THE CLI SHALL generate a random 256-bit AES key using `crypto.randomBytes(32)`
4. WHEN the AES key is generated, THE CLI SHALL encrypt the file contents using AES-256-GCM with a random 12-byte initialization vector generated via `crypto.randomBytes(12)`
5. WHEN encryption succeeds, THE CLI SHALL upload a JSON object containing `ciphertext`, `iv`, and `authTag` fields to Upstash Redis keyed by the ID_Portion
6. WHEN uploading to Redis, THE CLI SHALL set the key expiry to 86400 seconds
7. WHEN the upload succeeds, THE CLI SHALL print a single Shareable_Key to stdout in the format `envlock_XXXX-XXXX-XXXX-XXXX`
8. IF the input file does not exist or is not readable, THEN THE CLI SHALL exit with a non-zero code and print an error message indicating the file was not found or not accessible
9. IF the Redis upload fails, THEN THE CLI SHALL exit with a non-zero code and print an error message without revealing any plaintext file content or cryptographic key material
10. THE CLI SHALL not modify or delete the input file during the encrypt operation

### Requirement 2: Decrypt Command

**User Story:** As a developer, I want to decrypt a shared key and get the .env contents, so that I can use my teammate's secrets locally.

#### Acceptance Criteria

1. WHEN the user runs `elock decrypt <key>`, THE CLI SHALL parse the Shareable_Key to extract the ID_Portion and Secret_Key_Portion
2. WHEN the ID_Portion is extracted, THE CLI SHALL fetch the Ciphertext_Blob from Upstash Redis using the ID_Portion as the key
3. WHEN the Ciphertext_Blob is fetched, THE CLI SHALL decrypt the ciphertext using AES-256-GCM with the Secret_Key_Portion, iv, and authTag
4. WHEN decryption succeeds and no `.env` file exists in the current working directory, THE CLI SHALL write the decrypted content to a new `.env` file and print a success message indicating the file was created
5. WHEN decryption succeeds and a `.env` file exists in the current working directory, THE CLI SHALL trigger the Merge_Flow
6. IF the Shareable_Key format is invalid, THEN THE CLI SHALL exit with a non-zero code and print an error message indicating an invalid key format
7. IF the Redis key is not found or expired, THEN THE CLI SHALL exit with a non-zero code and print an error message indicating the key has expired or does not exist
8. IF decryption fails due to an incorrect key or tampered ciphertext, THEN THE CLI SHALL exit with a non-zero code and print an error message indicating authentication failure
9. IF the user runs `elock decrypt` without providing a key argument, THEN THE CLI SHALL exit with a non-zero code and print an error message indicating that a Shareable_Key argument is required
10. IF the Redis fetch fails due to a network error or unavailable service, THEN THE CLI SHALL exit with a non-zero code and print an error message indicating a connection failure without revealing any secret material
11. IF writing the `.env` file fails due to filesystem errors, THEN THE CLI SHALL exit with a non-zero code and print an error message indicating the file could not be written

### Requirement 3: Decrypt Flags

**User Story:** As a developer, I want control over how decrypted content is applied, so that I can preview changes or overwrite my file without prompting.

#### Acceptance Criteria

1. WHEN the user passes `--dry-run` to `elock decrypt` and a `.env` file exists in the current working directory, THE CLI SHALL print the categorized diff to stdout showing new keys, changed keys, and unchanged keys with their counts, without writing to disk or prompting the user
2. WHEN the user passes `--dry-run` to `elock decrypt` and no `.env` file exists in the current working directory, THE CLI SHALL print all decrypted keys categorized as new keys to stdout without writing to disk
3. WHEN the user passes `--replace` to `elock decrypt`, THE CLI SHALL overwrite the existing `.env` file with the full decrypted content without triggering the Merge_Flow
4. WHEN the user passes `--replace` to `elock decrypt` and no `.env` file exists in the current working directory, THE CLI SHALL write the decrypted content to a new `.env` file without triggering the Merge_Flow
5. IF the user passes both `--dry-run` and `--replace` to `elock decrypt`, THEN THE CLI SHALL exit with a non-zero code and print an error message indicating the flags are mutually exclusive
6. WHILE `--dry-run` is active, THE CLI SHALL produce zero side effects on the filesystem

### Requirement 4: Merge Flow

**User Story:** As a developer, I want to interactively merge incoming secrets into my existing .env, so that I can selectively accept changes without losing my local customizations.

#### Acceptance Criteria

1. WHEN the Merge_Flow is triggered, THE CLI SHALL categorize keys into three buckets: new keys (present in decrypted, absent in existing), changed keys (present in both with different values), and unchanged keys (identical values)
2. WHEN new keys are identified, THE CLI SHALL prompt the user for each new key displaying the key name and its value in the format `Add NEW_KEY=<value>? (y/n)`
3. WHEN changed keys are identified, THE CLI SHALL prompt the user for each changed key displaying both current and new values in the format showing `current: <old_val>` and `new: <new_val>` followed by `Overwrite? (y/n)`
4. WHEN the user accepts new keys, THE CLI SHALL append accepted keys at the end of the existing Env_File under a comment header in the format `# --- added by elock <ISO-date> ---`
5. WHEN the user accepts changed keys, THE CLI SHALL update the values in-place preserving the original key position in the file
6. THE CLI SHALL preserve all existing comments, blank lines, and key ordering in the merged output for lines that are not modified
7. THE CLI SHALL skip unchanged keys without prompting the user
8. WHEN a key exists in the existing Env_File but not in the decrypted content, THE CLI SHALL leave that key unchanged in the output (no deletion of local-only keys)
9. THE CLI SHALL compare values as trimmed strings when determining whether a key is changed or unchanged

### Requirement 5: Shareable Key Encoding

**User Story:** As a developer, I want the shareable key to be compact and easy to type, so that I can share it via chat or voice without errors.

#### Acceptance Criteria

1. THE CLI SHALL produce Shareable_Keys with the fixed prefix `envlock_` followed by dash-separated 4-character chunks
2. THE CLI SHALL use a base32 or base58 alphabet for the Token characters, excluding visually ambiguous characters (0/O, 1/l/I)
3. THE CLI SHALL encode both the ID_Portion and Secret_Key_Portion within the Token
4. THE CLI SHALL generate the ID_Portion using cryptographically random bytes sufficient to avoid collisions across concurrent users
5. WHEN a Shareable_Key is parsed, THE CLI SHALL deterministically extract the ID_Portion and Secret_Key_Portion from the Token
6. WHEN parsing a Shareable_Key, THE CLI SHALL accept the token in a case-insensitive manner to accommodate manual typing errors
7. FOR ALL valid Shareable_Keys, encoding the ID_Portion and Secret_Key_Portion into a Token then parsing that Token SHALL produce the original ID_Portion and Secret_Key_Portion (round-trip property)

### Requirement 6: .env File Parsing

**User Story:** As a developer, I want robust .env parsing, so that complex env files with comments, quotes, and multi-line values are handled correctly.

#### Acceptance Criteria

1. THE Parser SHALL parse lines matching the pattern `KEY=value` into structured key-value pairs, where KEY consists of one or more characters from the set [A-Z, a-z, 0-9, underscore] optionally preceded by the word `export` and a space
2. THE Parser SHALL support single-quoted values (treated as literals with no escape processing), double-quoted values (with escape sequences `\n`, `\r`, `\\`, and `\"` expanded), and unquoted values (trimmed of leading/trailing whitespace)
3. THE Parser SHALL support multi-line values enclosed in double quotes or single quotes, where the value spans from the opening quote to the next unescaped matching closing quote across line boundaries
4. THE Parser SHALL preserve comment lines (lines starting with optional leading whitespace followed by `#`) as structural elements in their original position
5. THE Parser SHALL preserve blank lines as structural elements in their original position
6. IF a line does not conform to any recognized pattern (KEY=value, comment, or blank line), THEN THE Parser SHALL preserve it as-is as a structural element without raising an error
7. WHEN parsing an unquoted value, THE Parser SHALL treat a `#` preceded by whitespace as the start of an inline comment and exclude it from the parsed value
8. THE Pretty_Printer SHALL format structured key-value pairs back into valid Env_File content that is parseable by the Parser
9. FOR ALL valid Env_File content, parsing then pretty-printing then parsing SHALL produce identical structured key-value pairs with the same keys, values, and element ordering (round-trip property)
10. WHEN parsing a KEY=value line, THE Parser SHALL ignore whitespace between KEY and the `=` sign and between the `=` sign and the start of the value

### Requirement 7: Cryptographic Security

**User Story:** As a developer, I want end-to-end encryption with no server-side access to my secrets, so that my credentials remain confidential even if Redis is compromised.

#### Acceptance Criteria

1. THE Crypto_Module SHALL generate a new random 256-bit key for each encryption operation using `crypto.randomBytes(32)`
2. THE Crypto_Module SHALL generate a new random 12-byte (96-bit) initialization vector for each encryption operation using `crypto.randomBytes(12)`
3. THE Crypto_Module SHALL use AES-256-GCM as the sole encryption algorithm with a 128-bit authentication tag length
4. THE CLI SHALL transmit only the Ciphertext_Blob (ciphertext, iv, and authTag encoded as hex or base64 strings) to Upstash Redis
5. THE CLI SHALL never transmit the Secret_Key_Portion to any remote service
6. THE CLI SHALL never log, print in error messages, or write to temporary files any plaintext secret content or decryption keys
7. WHEN GCM authentication tag verification fails, THE Crypto_Module SHALL reject the decryption and throw an error indicating authentication failure without revealing the key or plaintext in the error output

### Requirement 8: Upstash Redis Integration

**User Story:** As a developer, I want the encrypted data stored in a managed Redis service, so that my teammates can retrieve it without running infrastructure.

#### Acceptance Criteria

1. THE CLI SHALL read `UPSTASH_REDIS_REST_URL` from environment variables for Redis connection
2. THE CLI SHALL read `UPSTASH_REDIS_REST_TOKEN` from environment variables for Redis authentication
3. IF `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` is not set or is an empty string, THEN THE CLI SHALL exit with a non-zero code and print an error message indicating which environment variable is missing
4. WHEN storing a Ciphertext_Blob, THE CLI SHALL use the `@upstash/redis` package to SET the JSON-serialized value at the ID_Portion key with an EX of 86400 seconds
5. WHEN retrieving a Ciphertext_Blob, THE CLI SHALL validate that the response contains `ciphertext`, `iv`, and `authTag` fields as non-empty strings before attempting decryption
6. IF the Redis response is missing any of the required fields (`ciphertext`, `iv`, `authTag`) or any field is not a non-empty string, THEN THE CLI SHALL exit with a non-zero code and print an error message indicating corrupted data
7. IF the `@upstash/redis` client throws a connection or request error during a SET or GET operation, THEN THE CLI SHALL exit with a non-zero code and print an error message indicating a Redis connection failure without revealing the URL or token values

### Requirement 9: CLI Conventions

**User Story:** As a developer, I want standard CLI help and version flags, so that I can discover usage quickly.

#### Acceptance Criteria

1. WHEN the user runs `elock --help` or `elock -h`, THE CLI SHALL print usage information listing all available commands (`encrypt`, `decrypt`) and global flags (`--help`, `--version`), then exit with code 0
2. WHEN the user runs `elock --version` or `elock -v`, THE CLI SHALL print only the current version string as specified in package.json (e.g., `1.0.0`) to stdout, then exit with code 0
3. WHEN the user runs an unrecognized command, THE CLI SHALL exit with a non-zero code and print an error message indicating the unrecognized command followed by the usage information to stderr
4. THE CLI SHALL use `commander` or `yargs` as the argument parsing library
5. WHEN the user runs `elock encrypt --help` or `elock decrypt --help`, THE CLI SHALL print subcommand-specific usage information listing the arguments and flags for that command, then exit with code 0

### Requirement 10: Testing

**User Story:** As a developer, I want comprehensive test coverage, so that I can confidently ship changes without regressions.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests verifying AES-256-GCM encryption and decryption round-trips produce the original plaintext for inputs of 0 bytes, 1 byte, and at least 10 KB
2. THE Test_Suite SHALL include unit tests verifying Shareable_Key encode/decode round-trips produce the original ID_Portion and Secret_Key_Portion for all generated keys
3. THE Test_Suite SHALL include unit tests verifying Env_File parsing produces structured key-value pairs where: single-quoted values strip outer quotes, double-quoted values strip outer quotes and interpret escape sequences, multi-line values preserve internal newlines, comment lines are retained as structural elements, and blank lines are retained as structural elements
4. THE Test_Suite SHALL include unit tests verifying diff categorization assigns each key to exactly one bucket — new (present in decrypted, absent in existing), changed (present in both with differing values), or unchanged (present in both with identical values) — given a known existing and decrypted key set
5. THE Test_Suite SHALL include unit tests verifying that merge write output preserves all original comments, blank lines, and key ordering, inserts accepted new keys at the end, and updates accepted changed key values in their original line positions
6. THE Test_Suite SHALL include an integration test that operates in a temporary directory with a mocked `@upstash/redis` client and asserts: encrypt produces a valid Shareable_Key, the mocked Redis receives a Ciphertext_Blob with `ciphertext`, `iv`, and `authTag` fields, decrypt with the produced key recovers the original content, and merge applies changes to an existing Env_File without corrupting unrelated keys
7. THE Test_Suite SHALL include tests verifying that decryption with an incorrect Secret_Key_Portion throws an authentication error that the calling code can distinguish from other error types
8. THE Test_Suite SHALL include tests verifying that when the mocked Redis returns null for a key lookup, the CLI exits with a non-zero code and writes an error message to stderr indicating the key has expired or does not exist
9. THE Test_Suite SHALL use property-based testing with a minimum of 100 generated cases for each round-trip property: crypto encrypt/decrypt, Shareable_Key encode/decode, and Env_File parse/pretty-print
