# fastenv — secure, one-command .env sharing

Built for the [Ready, Spec, Ship Hackathon](https://codingagents.fyi) using [Kiro](https://kiro.dev).

## Problem

Developers routinely share `.env` files by pasting them into Slack, WhatsApp, email, or Telegram — leaving plaintext secrets sitting in chat histories and inboxes indefinitely, with no expiry and no clean way to hand off an update without overwriting a teammate's existing values.

## Solution

`fastenv` is a CLI tool that encrypts a `.env` file client-side, uploads only the encrypted blob to Upstash Redis, and returns a single shareable key. The recipient runs one command to decrypt it — and if they already have their own `.env`, `fastenv` walks them through merging just the new and changed keys instead of blindly overwriting. Every key expires automatically 24 hours after creation, so nothing lingers the way a chat message does.

## Key features

- One command to encrypt and share (`fast encrypt`), one to decrypt (`fast decrypt`)
- Client-side-only AES-256-GCM encryption — the backend never sees plaintext or the decryption key
- Smart merge flow: new keys, changed keys, and untouched keys are diffed and handled separately, not overwritten wholesale
- `--dry-run` to preview the merge before committing, `--replace` to skip it entirely
- Fixed 24-hour expiry on every share — no config, no leftover secrets

## How it works

1. `fast encrypt` reads your `.env`, encrypts it with a randomly generated key (AES-256-GCM), uploads the ciphertext to Redis, and prints a single shareable key.
2. You share that key however you like — it's just a string, safe to paste anywhere, since it's meaningless without the encrypted blob it's paired with.
3. Your teammate runs `fast decrypt <key>`. It fetches the ciphertext, decrypts it locally, and either writes a new `.env` or walks them through merging it into their existing one.
4. The key and its ciphertext both expire automatically **24 hours** after creation. Nothing lingers.

**Encryption and decryption always happen client-side.** The backend (Upstash Redis) only ever stores an opaque encrypted blob — it never sees your decryption key or your plaintext values.

## Install

```bash
npm install -g fastenv
```

## Setup

`fastenv` needs an Upstash Redis instance to store encrypted blobs temporarily. Upstash has a free tier that takes under a minute to set up.

1. Create a free database at [upstash.com](https://upstash.com).
2. Copy your REST URL and REST token from the Upstash console.
3. Set them as environment variables:

```bash
export UPSTASH_REDIS_REST_URL="https://your-instance.upstash.io"
export UPSTASH_REDIS_REST_TOKEN="your-token"
```

(Or place them in a `.env` file in your shell config / project — just don't confuse this with the `.env` file you're trying to share.)

## Usage

### Encrypt and share

```bash
fast encrypt
```

Encrypts `.env` in the current directory and prints a key:

```
Encrypted and uploaded. Share this key (expires in 24h):
envlock_7F3K-93MZ-QP2X-8LWD
```

Encrypt a different file:

```bash
fast encrypt path/to/.env.production
```

### Decrypt and merge

```bash
fast decrypt envlock_7F3K-93MZ-QP2X-8LWD
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
fast decrypt envlock_7F3K-93MZ-QP2X-8LWD --dry-run
```

Shows the full new / changed / unchanged breakdown with no prompts and no file changes, so you know what you're about to walk through.

### Skip the merge entirely

```bash
fast decrypt envlock_7F3K-93MZ-QP2X-8LWD --replace
```

Overwrites your existing `.env` completely with the decrypted content, no questions asked.

## Security model

- **Encryption:** AES-256-GCM with a randomly generated 256-bit key per encryption — not derived from a human password, so there's no weak-passphrase risk.
- **Client-side only:** Redis stores ciphertext, an IV, and an auth tag — never the decryption key, never plaintext.
- **Expiry:** every lock expires automatically 24 hours after creation via Redis's native TTL. There's no way to extend it and no configuration for a longer window.
- **Access:** anyone with the full key can decrypt until it expires. There's no single-use restriction — treat the key itself as a secret for those 24 hours, the same way you'd treat any other credential.
- **Tampering:** any modification to the stored ciphertext is detected and rejected via GCM authentication — it fails loudly rather than producing corrupted output.

## Costs and limits

- Upstash's free tier is sufficient for testing and normal use; see [Upstash pricing](https://upstash.com/pricing) for current limits.
- No other paid services are required to run `fastenv`.

## Built with Kiro

This project was built using Kiro. See the [`.kiro/`](./.kiro) directory for the specs, steering files, and configuration used during development.

## License

MIT
