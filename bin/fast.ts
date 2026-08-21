#!/usr/bin/env node
import { program } from 'commander';
import { encryptCommand, parseDuration } from '../src/commands/encrypt.js';
import { decryptCommand } from '../src/commands/decrypt.js';
import { FastenvError } from '../src/types.js';
import pkg from '../package.json' with { type: 'json' };

program
  .name('fast')
  .description('Securely share .env files with teammates')
  .version(pkg.version);

program
  .command('encrypt [path]')
  .description('Encrypt a .env file and get a shareable key')
  .argument('[expiry]', 'Expiry duration (e.g. 30s, 5m, 2h). Defaults to 100s')
  .action(async (path?: string, expiry?: string) => {
    try {
      let expirySeconds: number | undefined;
      // Check if 'path' is actually a duration (e.g. "5m") and no separate expiry given
      if (path && /^\d+[smh]$/i.test(path)) {
        expirySeconds = parseDuration(path);
        path = undefined;
      } else if (expiry) {
        expirySeconds = parseDuration(expiry);
      }
      await encryptCommand(path, expirySeconds);
    } catch (err) {
      if (err instanceof FastenvError) {
        process.stderr.write(`Error: ${err.message}\n`);
        process.exit(1);
      }
      throw err;
    }
  });

program
  .command('decrypt <key>')
  .description('Decrypt a shareable key and merge into local .env')
  .option('--dry-run', 'Preview changes without writing to disk')
  .option('--replace', 'Overwrite existing .env without prompting')
  .action(async (key: string, options: { dryRun?: boolean; replace?: boolean }) => {
    try {
      await decryptCommand(key, options);
    } catch (err) {
      if (err instanceof FastenvError) {
        process.stderr.write(`Error: ${err.message}\n`);
        process.exit(1);
      }
      throw err;
    }
  });

program.on('command:*', (operands) => {
  process.stderr.write(`Error: unknown command '${operands[0]}'\n`);
  program.outputHelp({ error: true });
  process.exit(1);
});

program.parse();
