# fastenv — secure, one-command .env sharing

Built for the [Ready, Spec, Ship Hackathon](https://codingagents.fyi) using [Kiro](https://kiro.dev).

## Problem

Developers routinely share `.env` files by pasting them into Slack, WhatsApp, email, or Telegram — leaving plaintext secrets sitting in chat histories and inboxes indefinitely, with no expiry and no clean way to hand off an update without overwriting a teammate's existing values.

## Solution

`fastenv` is a CLI tool that encrypts a `.env` file client-side, uploads only the encrypted blob to Upstash Redis, and returns a single shareable key. The recipient runs one command to decrypt it — and if they already have their own `.env`, `fastenv` walks them through merging just the new and changed keys instead of blindly overwriting. Every key expires automatically (default: 100 seconds, configurable up to hours), so nothing lingers the way a chat message does.

## Key features

- One command to encrypt and share (`fast encrypt`), one to decrypt (`fast decrypt`)
- Client-side-only AES-256-GCM encryption — the backend never sees plaintext or the decryption key
- Smart merge flow: new keys, changed keys, and untouched keys are diffed and handled separately, not overwritten wholesale
- `--dry-run` to preview the merge before committing, `--replace` to skip it entirely
- Configurable expiry on every share (default 100s, e.g. `5m`, `2h`) — no leftover secrets

## How it works

1. `fast encrypt` reads your `.env`, encrypts it with a randomly generated key (AES-256-GCM), uploads the ciphertext to Redis, and prints a single shareable key.
2. You share that key however you like — it's just a string, safe to paste anywhere, since it's meaningless without the encrypted blob it's paired with.
3. Your teammate runs `fast decrypt <key>`. It fetches the ciphertext, decrypts it locally, and either writes a new `.env` or walks them through merging it into their existing one.
4. The key and its ciphertext both expire automatically after the configured duration (default **100 seconds**). Nothing lingers.

**Encryption and decryption always happen client-side.** The backend (Upstash Redis) only ever stores an opaque encrypted blob — it never sees your decryption key or your plaintext values.

## Install

```bash
npm install -g fastenv
```

## Usage

### Encrypt and share

```bash
fast encrypt
```

Encrypts `.env` in the current directory with the default 100-second expiry and prints a key:

```
envlock_7F3K-93MZ-QP2X-8LWD
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
- **Expiry:** every lock expires automatically via Redis's native TTL. The default is 100 seconds; you can set a custom duration with suffixes `s` (seconds), `m` (minutes), or `h` (hours).
- **Access:** anyone with the full key can decrypt until it expires. There's no single-use restriction — treat the key itself as a secret for those 24 hours, the same way you'd treat any other credential.
- **Tampering:** any modification to the stored ciphertext is detected and rejected via GCM authentication — it fails loudly rather than producing corrupted output.

## Built with Kiro

This project was built using Kiro. See the [`.kiro/`](./.kiro) directory for the specs, steering files, and configuration used during development.

## License

MIT
