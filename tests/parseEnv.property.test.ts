import { describe, it } from 'vitest';
import fc from 'fast-check';
import { parse, stringify } from '../src/parseEnv.js';

// Generator for valid .env key names: [A-Za-z_][A-Za-z0-9_]*
const envKey = fc.stringOf(
  fc.oneof(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_'.split('')),
    fc.constantFrom(...'0123456789'.split(''))
  ),
  { minLength: 1, maxLength: 20 }
).filter(k => /^[A-Za-z_]/.test(k));

// Generator for simple values (no newlines, no problematic characters for unquoted values)
const simpleValue = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789.-_/'.split('')),
  { minLength: 0, maxLength: 30 }
);

// Generator for a single .env line
const envLine = fc.oneof(
  // Comment line
  fc.tuple(fc.constant('# '), fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789 .-_/'.split('')),
    { minLength: 0, maxLength: 30 }
  )).map(([prefix, text]) => prefix + text),
  // Blank line
  fc.constant(''),
  // KEY=value (unquoted)
  fc.tuple(envKey, simpleValue).map(([k, v]) => `${k}=${v}`),
  // KEY="value" (double-quoted, no embedded quotes or backslashes for simplicity)
  fc.tuple(envKey, simpleValue).map(([k, v]) => `${k}="${v}"`),
  // KEY='value' (single-quoted)
  fc.tuple(envKey, simpleValue).map(([k, v]) => `${k}='${v}'`),
  // export KEY=value (unquoted with export prefix)
  fc.tuple(envKey, simpleValue).map(([k, v]) => `export ${k}=${v}`),
);

// Generator for .env file content (multiple lines joined with newlines)
const envContent = fc.array(envLine, { minLength: 1, maxLength: 20 }).map(lines => lines.join('\n'));

describe('parseEnv properties', () => {
  /**
   * Property 4: .env parse/stringify round-trip
   *
   * For any valid .env file content, parse(stringify(parse(content))) SHALL produce
   * an array of EnvEntry objects with identical keys, values, and element ordering
   * as parse(content). Parsing then pretty-printing then re-parsing is idempotent
   * on the structured representation.
   *
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 6.9, 10.3**
   */
  it('Property 4: parse/stringify round-trip is idempotent', () => {
    fc.assert(
      fc.property(envContent, (content) => {
        const firstParse = parse(content);
        const stringified = stringify(firstParse);
        const secondParse = parse(stringified);

        // Same number of entries
        if (firstParse.length !== secondParse.length) return false;

        // Each entry has same type, key, value, and ordering
        for (let i = 0; i < firstParse.length; i++) {
          const a = firstParse[i];
          const b = secondParse[i];

          if (a.type !== b.type) return false;
          if (a.key !== b.key) return false;
          if (a.value !== b.value) return false;
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });
});
