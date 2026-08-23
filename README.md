# fastenv — secure, one-command .env sharing

Built for the [Ready, Spec, Ship Hackathon](https://codingagents.fyi) using [Kiro](https://kiro.dev).

---

## Problem

Developers routinely share `.env` files by pasting them into Slack, WhatsApp, email, or Telegram — leaving plaintext secrets sitting in chat histories and inboxes indefinitely, with no expiry and no clean way to hand off an update without overwriting a teammate's existing values.

## Solution

`fastenv` is a CLI tool that encrypts a `.env` file client-side, uploads only the encrypted blob to Upstash Redis, and returns a single shareable token. The recipient runs one command to decrypt it — and if they already have their own `.env`, `fastenv` walks them through merging just the new and changed keys instead of blindly overwriting. Every token expires automatically (default: 100 seconds, configurable up to hours), so nothing lingers the way a chat message does.

## Key Features

- One command to encrypt and share (`fast encrypt`), one to decrypt (`fast decrypt`)
- Client-side-only AES-128-GCM encryption — the backend never sees plaintext or the decryption key
- Smart merge flow: new keys, changed keys, and untouched keys are diffed and handled separately
- `--status` to preview the merge before committing, `--replace` to skip it entirely
- Configurable expiry on every share (default 100s, e.g. `5m`, `2h`) — no leftover secrets

---

## Setup Instructions

### Prerequisites

- **Node.js** >= 18
- **npm** (comes with Node.js)

### Option 1: Install from npm (recommended)

fastenv is published on npm and can be installed globally:

```bash
npm install -g @olabodelawal/fastenv
```

Once installed, the `fast` command is available globally. You still need a `.env` file with Upstash Redis credentials in the directory where you run the command (see [Configuration](#configuration) below).

### Option 2: Run locally from source

```bash
# Clone the repository
git clone https://github.com/matrix6c/fastenv.git
cd fastenv

# Install dependencies
npm install

# Run directly via tsx (no build step needed)
npx tsx bin/fast.ts encrypt path/of/env/file/to/encrypt
npx tsx bin/fast.ts decrypt path/of/project <token>
```

### Option 3: Build and run from compiled output

```bash
npm install
npm run build
node dist/bin/fast.js encrypt
node dist/bin/fast.js decrypt <token>
```

---

## Configuration

fastenv requires two environment variables to connect to Upstash Redis. Create a `.env` file in the project root (or the directory where you run the command):

```env
UPSTASH_REDIS_REST_URL="https://your-instance.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token-here"
```

A `.env.example` file is provided in the repository as a template.

---

## Usage

### Encrypt and share

```bash
# If installed globally via npm:
fast encrypt

# If running locally from source:
npx tsx bin/fast.ts encrypt
```

Encrypts `.env` in the current directory with the default 100-second expiry and prints a token:

```
envlock_7XJB-7895-GN59-E39X-29XM-DYG5-38V9-QZQX
```

**Set a custom expiry duration:**

```bash
npx tsx bin/fast.ts encrypt 5m          # expires in 5 minutes
npx tsx bin/fast.ts encrypt 30s         # expires in 30 seconds
npx tsx bin/fast.ts encrypt 2h          # expires in 2 hours
```

**Encrypt a different file:**

```bash
npx tsx bin/fast.ts encrypt path/to/.env.production
```

**Encrypt a specific file with a custom expiry:**

```bash
npx tsx bin/fast.ts encrypt path/to/.env.production 10m
```

### Decrypt and merge

```bash
npx tsx bin/fast.ts decrypt envlock_7XJB-7895-GN59-E39X-29XM-DYG5-38V9-QZQX
```

- If you don't have a `.env` yet, it writes one directly.
- If you already have one, `fastenv` compares both files and walks you through each difference:

```
NEW_KEY is new. Add it? (y/n)

API_KEY changed:
  current: sk_test_old
  new:     sk_test_new
Overwrite? (y/n)
```

Unchanged keys are left alone automatically — you're only asked about things that actually differ.

### Preview before merging

```bash
npx tsx bin/fast.ts decrypt envlock_... --status
```

Shows the full new / changed / unchanged breakdown with no prompts and no file changes.

### Skip the merge entirely

```bash
npx tsx bin/fast.ts decrypt envlock_... --replace
```

Overwrites your existing `.env` completely with the decrypted content, no questions asked.

---

## Testing Instructions

### Run the test suite

```bash
npm install
npm test
```

This runs all unit tests and property-based tests via Vitest. The test suite covers:

- Crypto module (AES-128-GCM encrypt/decrypt round-trips)
- Token encoding/decoding (base32 round-trips)
- `.env` parsing and stringification
- Diff/merge logic (new, changed, unchanged key classification)
- Integration tests (full encrypt → decrypt flow with mocked Redis)
- Error handling (expired tokens, invalid input, missing config)
- Property-based tests via fast-check (crypto, token, parseEnv, diffMerge)

### Manual end-to-end test

To manually test the full flow:

1. Create a `.env` file with the test credentials above
2. Create a test file to encrypt (e.g. `test.env`):
   ```env
   SECRET_KEY=hello123
   API_URL=https://example.com
   ```
3. Encrypt it:
   ```bash
   npx tsx bin/fast.ts encrypt test.env
   ```
4. Copy the printed token
5. Decrypt it (in a different directory or after renaming your `.env`):
   ```bash
   npx tsx bin/fast.ts decrypt <token>
   ```
6. Verify the decrypted content matches the original

Note: tokens expire after 100 seconds by default, so run decrypt promptly.

---

## How It Works

1. `fast encrypt` reads your `.env`, encrypts it with a randomly generated key (AES-128-GCM), uploads the ciphertext to Redis, and prints a single shareable token.
2. You share that token however you like — it's just a string, safe to paste anywhere, since it's meaningless without the encryption key embedded in it.
3. Your teammate runs `fast decrypt <token>`. It fetches the ciphertext, decrypts it locally, and either writes a new `.env` or walks them through merging it into their existing one.
4. The ciphertext expires automatically after the configured duration (default **100 seconds**). Nothing lingers.

**Encryption and decryption always happen client-side.** The backend (Upstash Redis) only stores an opaque encrypted blob — it never sees your decryption key or your plaintext values.

---

## Security Model

### Anatomy of a Token

```
envlock_7XJB-7895-GN59-E39X-29XM-DYG5-38V9-QZQX
         ├──────┘ ├─────────────────────────────┘
         │        │
         │        └── Encryption key (16 bytes / 128 bits)
         │            AES-128-GCM secret key.
         │            NEVER leaves your machine or gets sent to the server.
         │
         └── Lookup ID (4 bytes)
             Random identifier used to find the encrypted blob in Redis.
             This is the ONLY part the server knows about.
```

| Component | Size | Purpose | Where it goes |
|-----------|------|---------|---------------|
| **Lookup ID** | 4 bytes | Identifies which blob to fetch from Redis | Sent to Redis as the key |
| **Encryption Key** | 16 bytes (128 bits) | AES-128-GCM secret for encryption/decryption | Stays in the token only — never transmitted to any server |

### What Gets Stored in Redis

```json
{
  "ciphertext": "a3f2b1c4...",
  "iv": "9e8d7c6b5a4f...",
  "authTag": "1a2b3c4d..."
}
```

Even if someone compromises the Redis database, they get only encrypted blobs they cannot decrypt without the token.

### Encryption Details

- **Algorithm:** AES-128-GCM
- **Key generation:** 16 cryptographically random bytes via Node.js `crypto.randomBytes()`
- **IV:** 12 random bytes per encryption (standard for GCM)
- **Authentication:** GCM provides built-in authentication — any tampering is detected
- **Expiry:** Every blob expires via Redis's native TTL (default 100 seconds)

---

## ⚠️ Hackathon Disclaimer — Known Security Shortcuts

This project was built for a hackathon. Known shortcuts that would need addressing for production use:

### Redis Credentials Are Shared

A single Upstash Redis instance is shared across all installations using the provided test credentials. There's no per-user or per-team isolation at the storage layer.

### Production-Ready Improvements

1. **Per-team Redis instances** — Each team provisions their own Upstash Redis
2. **Single-use tokens** — Delete the blob after first successful decryption
3. **Access logging** — Record who decrypted what and when
4. **Rate limiting** — Prevent brute-force enumeration of lookup IDs

**Despite these shortcuts, the core security guarantee holds:** even with full Redis access, an attacker cannot decrypt your secrets without the token.

---

## API & Service Costs

### Upstash Redis (external service)

fastenv uses [Upstash Redis](https://upstash.com/docs/redis/overall/getstarted) as its ephemeral blob store. The **free tier** is used for this submission:

| Limit | Free Tier |
|-------|-----------|
| Commands/day | 10,000 |
| Storage | 256 MB |
| Max request size | 1 MB |
| Bandwidth | 50 GB/month |

- **Cost:** Free. No credit card required.
- Encrypted `.env` blobs are small (typically < 5 KB), so the free tier easily supports hundreds of shares per day.

### Rate Limits and Usage Restrictions

- **10,000 Redis commands per day** on the free tier (each encrypt = 1 SET, each decrypt = 1 GET)
- **Token expiry:** Default 100 seconds, configurable from 1 second to hours
- **Max `.env` file size:** Limited by the 1 MB Redis request size limit (far exceeds any realistic `.env` file)
- **No authentication required** — anyone with a valid token can decrypt before expiry

---

## Attribution — Third-Party Libraries, Frameworks, APIs, and Assets

### External Services

| Service | Purpose | License/Terms |
|---------|---------|---------------|
| [Upstash Redis](https://upstash.com) | Ephemeral encrypted blob storage with TTL | [Upstash Terms](https://upstash.com/trust/terms.html) |

### Runtime Dependencies

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| [`@upstash/redis`](https://github.com/upstash/upstash-redis) | ^1.34.0 | MIT | HTTP-based Redis client for storing/retrieving encrypted blobs |
| [`commander`](https://github.com/tj/commander.js) | ^12.0.0 | MIT | CLI argument parsing and help generation |
| [`inquirer`](https://github.com/SBoudrias/Inquirer.js) | ^9.0.0 | MIT | Interactive merge prompts (accept/reject individual keys) |
| [`dotenv`](https://github.com/motdotla/dotenv) | ^17.4.2 | BSD-2-Clause | Environment variable loading from `.env` files |
| [Node.js `crypto`](https://nodejs.org/api/crypto.html) | (built-in) | — | AES-128-GCM encryption/decryption, random byte generation |

### Dev Dependencies

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| [`vitest`](https://github.com/vitest-dev/vitest) | ^2.0.0 | MIT | Test runner |
| [`fast-check`](https://github.com/dubzzz/fast-check) | ^3.0.0 | MIT | Property-based testing |
| [`tsx`](https://github.com/privatenumber/tsx) | ^4.0.0 | MIT | TypeScript execution for development |
| [`typescript`](https://github.com/microsoft/TypeScript) | ^5.9.3 | Apache-2.0 | Type checking and compilation |
| [`@types/node`](https://github.com/DefinitelyTyped/DefinitelyTyped) | ^20.0.0 | MIT | Node.js type definitions |
| [`@types/inquirer`](https://github.com/DefinitelyTyped/DefinitelyTyped) | ^9.0.0 | MIT | Inquirer type definitions |

### Cost Summary

- **Upstash Redis:** Free (10,000 commands/day, no credit card required)
- **All npm packages:** Free and open-source
- **Node.js crypto:** Built-in, no external calls or costs

---

## Built with Kiro

This project was developed using [Kiro](https://kiro.dev) following its structured Spec-driven workflow. Kiro was used meaningfully throughout the entire development process — from requirements gathering through design, implementation, and testing.

### Specs

Kiro's spec system was the backbone of this project. Two specs live in [`.kiro/specs/`](./.kiro/specs):

| Spec | Purpose |
|------|---------|
| **`elock-cli`** | The primary spec covering the full CLI — requirements, design, and implementation plan for encryption, decryption, token encoding, .env parsing, merge flow, Redis integration, and testing. |
| **`shorten-token`** | A follow-up spec that shortened the token from 16 chunks to 8 by switching from AES-256-GCM (32-byte key + 8-byte ID) to AES-128-GCM (16-byte key + 4-byte ID). |

Each spec contains three documents authored iteratively with Kiro:

1. **`requirements.md`** — Formal user stories and acceptance criteria (10 requirements with 50+ acceptance criteria for the main spec).
2. **`design.md`** — Architecture diagrams (Mermaid), module interfaces, data models, and correctness properties for property-based testing.
3. **`tasks.md`** — A dependency-ordered implementation plan with task waves. Each task references specific requirement IDs for traceability.

### Workflow

The development followed Kiro's Requirements → Design → Tasks pipeline:

1. **Requirements phase** — Drafted acceptance criteria for each command, flag, and error path. Kiro refined ambiguities (e.g., trimmed string comparison for merge, mutual exclusivity of `--status`/`--replace`).
2. **Design phase** — Produced module boundaries, TypeScript interfaces, encrypt/decrypt sequence diagrams, and formal correctness properties (crypto round-trip, token round-trip, parse/stringify idempotency, diff partitioning, merge preservation).
3. **Task execution** — Kiro worked through the task plan wave-by-wave in Autopilot mode, implementing modules, writing tests (unit + property-based via `fast-check`), and verifying at checkpoints.
4. **Iterative refinement** — The `shorten-token` spec was created after the initial implementation to iterate on token UX, demonstrating how Kiro specs support incremental feature evolution on an existing codebase.

### Key Kiro Practices Used

- **Spec-driven development** — Every line of code traces back to a numbered requirement.
- **Correctness properties in design** — Six formal properties were defined in the design doc and implemented as property-based tests (100+ generated cases each).
- **Task dependency graphs** — Parallelizable work was identified upfront (e.g., crypto, token, and parser modules developed concurrently in wave 2).
- **Checkpoints** — Explicit pause points in the task list to run the full test suite and course-correct before proceeding.
- **Traceability** — Every task cites the requirement IDs it satisfies, making it easy to verify coverage.

### Project Structure (Kiro Artifacts)

```
.kiro/
└── specs/
    ├── elock-cli/
    │   ├── requirements.md    # 10 requirements, 50+ acceptance criteria
    │   ├── design.md          # Architecture, interfaces, correctness properties
    │   └── tasks.md           # 14 task groups, dependency graph
    └── shorten-token/
        ├── requirements.md    # 7 FR + 3 NFR for token shortening
        ├── design.md          # Targeted changes across 3 source files + tests
        └── tasks.md           # 3 task groups with wave ordering
```

---

## Team

**Individual submission** by [Olabode Lawal](https://github.com/matrix6c).

---

## License

MIT
