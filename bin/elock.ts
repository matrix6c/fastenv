#!/usr/bin/env node
import { program } from 'commander';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encryptCommand } from '../src/commands/encrypt.js';
import { decryptCommand } from '../src/commands/decrypt.js';
import { ElockError } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));

program
  .name('elock')
  .description('Securely share .env files with teammates')
  .version(pkg.version);

program
  .command('encrypt [path]')
  .description('Encrypt a .env file and get a shareable key')
  .action(async (path?: string) => {
    try {
      await encryptCommand(path);
    } catch (err) {
      if (err instanceof ElockError) {
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
      if (err instanceof ElockError) {
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
