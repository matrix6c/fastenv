# fastenv — secure, one-command .env sharing

<!-- Built for the [Ready, Spec, Ship Hackathon](https://codingagents.fyi) using [Kiro](https://kiro.dev). -->

## Problem

Developers routinely share `.env` files by pasting them into Slack, WhatsApp, email, or Telegram — leaving plaintext secrets sitting in chat histories and inboxes indefinitely, with no expiry and no clean way to hand off an update without overwriting a teammate's existing values.

## Solution

`fastenv` is a CLI tool that encrypts a `.env` file client-side, uploads only the encrypted blob to Upstash Redis, and returns a single shareable key. The recipient runs one command to decrypt it — and if they already have their own `.env`, `fastenv` walks them through merging just the new and changed keys instead of blindly overwriting. Every key expires automatically (default: 100 seconds, configurable up to hours), so nothing lingers the way a chat message does.

## Key features

- One command to encrypt and share (`fast encrypt`), one to decrypt (`fast decrypt`)
- Client-side-only AES-128-GCM encryption — the backend never sees plaintext or the decryption key
- Smart merge flow: new keys, changed keys, and untouched keys are diffed and handled separately, not overwritten wholesale
- `--dry-run` to preview the merge before committing, `--replace` to skip it entirely
- Configurable expiry on every share (default 100s, e.g. `5m`, `2h`) — no leftover secrets

## How it works

1. `fast encrypt` reads your `.env`, encrypts it with a randomly generated key (AES-128-GCM), uploads the ciphertext to Redis, and prints a single shareable token.
2. You share that token however you like — it's just a string, safe to paste anywhere, since it's meaningless without the encrypted blob it's paired with.
3. Your teammate runs `fast decrypt <token>`. It fetches the ciphertext, decrypts it locally, and either writes a new `.env` or walks them through merging it into their existing one.
4. The ciphertext expires automatically after the configured duration (default **100 seconds**). Nothing lingers.

**Encryption and decryption always happen client-side.** The backend (Upstash Redis) only ever stores an opaque encrypted blob — it never sees your decryption key or your plaintext values.

## Install

```bash
npm install -g @olabodelawal/fastenv
```

## Usage

### Encrypt and share

```bash
fast encrypt
```

Encrypts `.env` in the current directory with the default 100-second expiry and prints a token:

```
envlock_7XJB-7895-GN59-E39X-29XM-DYG5-38V9-QZQX
```

Set a custom expiry duration:

```bash
fast encrypt 5m          # expires in 5 minutes
fast encrypt 30s         # expires in 30 seconds
fast encrypt 2h          # expires in 2 hours
```

Encrypt a different file:

```bash
fast encrypt path/to/.env.production
```

Encrypt a specific file with a custom expiry:

```bash
fast encrypt path/to/.env.production 10m
```

### Decrypt and merge

```bash
fast decrypt envlock_7XJB-7895-GN59-E39X-29XM-DYG5-38V9-QZQX
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

Unchanged keys are left alone automatically — you're only ever asked about things that actually differ.

### Preview before merging

```bash
fast decrypt envlock_7XJB-7895-GN59-E39X-29XM-DYG5-38V9-QZQX --dry-run
```

Shows the full new / changed / unchanged breakdown with no prompts and no file changes, so you know what you're about to walk through.

### Skip the merge entirely

```bash
fast decrypt envlock_7XJB-7895-GN59-E39X-29XM-DYG5-38V9-QZQX --replace
```

Overwrites your existing `.env` completely with the decrypted content, no questions asked.

---

## Security Model

### Overview

fastenv uses a **zero-knowledge architecture**. The server (Redis) stores the encrypted data but never has access to the decryption key. Only the person holding the token can decrypt the contents.

### Anatomy of a Token

When you run `fast encrypt`, the tool generates a token like this:

```
envlock_7XJB-7895-GN59-E39X-29XM-DYG5-38V9-QZQX
         ├──────┘ ├─────────────────────────────┘
         │        │
         │        └── Encryption key (16 bytes / 128 bits)
         │            This is the AES-128-GCM secret key.
         │            It NEVER leaves your machine or gets sent
         │            to the server. Only someone with this
         │            portion can decrypt the data.
         │
         └── Lookup ID (4 bytes)
             A random identifier used to find the encrypted
             blob in Redis. This is the ONLY part the server
             knows about.
```

The token is a [base32-encoded](https://en.wikipedia.org/wiki/Base32) concatenation of two pieces:

| Component | Size | Purpose | Where it goes |
|-----------|------|---------|---------------|
| **Lookup ID** | 4 bytes (8 hex chars) | Identifies which blob to fetch from Redis | Sent to Redis as the key |
| **Encryption Key** | 16 bytes (128 bits) | The AES-128-GCM secret used for encryption/decryption | Stays in the token only — never transmitted to any server |

Both components are packed together, encoded using a custom base32 alphabet (no ambiguous characters like `0/O` or `1/I/l`), and chunked into 8 groups of 4 characters separated by dashes for readability.

### What Gets Stored in Redis

When you encrypt, the following blob is uploaded to Redis under the 4-byte lookup ID:

```json
{
  "ciphertext": "a3f2b1c4...",   // Your .env content, encrypted (hex)
  "iv": "9e8d7c6b5a4f...",       // 12-byte initialization vector (hex)
  "authTag": "1a2b3c4d..."       // 16-byte authentication tag (hex)
}
```

**What Redis has:**
- The encrypted gibberish (ciphertext)
- The IV (needed for decryption but useless without the key)
- The auth tag (used to detect tampering)

**What Redis does NOT have:**
- The encryption key (it's only in the token you printed locally)
- Your plaintext `.env` values
- Any way to reverse the encryption

This means even if someone compromises the Redis database, they get nothing useful — just encrypted blobs they cannot decrypt.

### Encryption Details

- **Algorithm:** AES-128-GCM (Advanced Encryption Standard, 128-bit key, Galois/Counter Mode)
- **Key generation:** 16 cryptographically random bytes via Node.js `crypto.randomBytes()` — not derived from any password, so there's zero weak-passphrase risk
- **IV:** 12 random bytes per encryption (standard for GCM)
- **Authentication:** GCM provides built-in authentication. Any modification to the ciphertext, IV, or auth tag is detected and rejected — decryption fails loudly rather than producing corrupted output
- **Expiry:** Every blob expires via Redis's native TTL (default 100 seconds, configurable with `5m`, `2h`, etc.)

### How AES-128 Compares to AES-256

AES-128 is widely used in production systems including TLS (HTTPS), banking infrastructure, and government classified data (up to SECRET level). The key space of 2^128 is computationally infeasible to brute-force with any existing or foreseeable technology. For a tool sharing short-lived secrets that expire in seconds to hours, AES-128 is more than sufficient.

---

## ⚠️ Hackathon Disclaimer — Known Security Shortcuts

This project was built for a hackathon. The primary goal was to get the core concept working end-to-end. As a result, there are known shortcuts that would need to be addressed before any production use:

### Redis Credentials Are Hardcoded

The Upstash Redis URL and token are **hardcoded directly in the source code** (`src/redis.ts`). This was done purely to simplify the hackathon demo — there's no environment variable configuration or secrets management.

**What this means in practice:**
- Anyone reading the source code can see the Redis credentials
- The shared Redis instance is used by all installations of this tool
- There's no per-user or per-team isolation at the storage layer

### How This Could Be Made Production-Ready

If you wanted to take this concept further, here's what you'd do:

1. **Environment-based configuration** — Read `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from environment variables or a config file, so each team/user uses their own Redis instance.

2. **Per-team Redis instances** — Each team provisions their own Upstash Redis (free tier works fine for small teams), ensuring complete data isolation.

3. **Single-use tokens** — Delete the blob from Redis after the first successful decryption, so the token becomes a true one-time link.

4. **Access logging** — Record who decrypted what and when, for audit trails.

5. **Rate limiting** — Prevent brute-force enumeration of lookup IDs (though 4 random bytes = ~4 billion possibilities makes this impractical even without rate limiting for short-lived secrets).

6. **End-to-end encrypted metadata** — Encrypt the blob key name itself so Redis logs don't reveal access patterns.

**Despite these shortcuts, the core security guarantee holds:** even with full Redis access, an attacker cannot decrypt your secrets without the token. The encryption key never touches the server.

---

## Built with Kiro

This project was built using [Kiro](https://kiro.dev). See the [`.kiro/`](./.kiro) directory for the specs, steering files, and configuration used during development.

## License

MIT
