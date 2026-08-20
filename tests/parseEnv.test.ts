import { describe, it, expect } from 'vitest';
import { parse, stringify, toMap } from '../src/parseEnv.js';

describe('parseEnv', () => {
  describe('parse', () => {
    it('parses simple KEY=value', () => {
      const entries = parse('FOO=bar');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual({
        type: 'keyvalue',
        key: 'FOO',
        value: 'bar',
        raw: 'FOO=bar',
        exported: false,
        quoteStyle: 'none',
      });
    });

    it('parses KEY with underscores and digits', () => {
      const entries = parse('MY_VAR_2=hello');
      expect(entries[0].key).toBe('MY_VAR_2');
      expect(entries[0].value).toBe('hello');
    });

    it('parses export prefix', () => {
      const entries = parse('export SECRET=mysecret');
      expect(entries[0].exported).toBe(true);
      expect(entries[0].key).toBe('SECRET');
      expect(entries[0].value).toBe('mysecret');
    });

    it('handles whitespace around = sign', () => {
      const entries = parse('KEY = value');
      expect(entries[0].key).toBe('KEY');
      expect(entries[0].value).toBe('value');
    });

    it('handles whitespace before value after =', () => {
      const entries = parse('KEY=  value');
      expect(entries[0].value).toBe('value');
    });

    it('parses double-quoted values with escape sequences', () => {
      const entries = parse('MSG="hello\\nworld"');
      expect(entries[0].value).toBe('hello\nworld');
      expect(entries[0].quoteStyle).toBe('double');
    });

    it('handles \\r escape in double-quoted values', () => {
      const entries = parse('MSG="line\\r"');
      expect(entries[0].value).toBe('line\r');
    });

    it('handles \\\\ escape in double-quoted values', () => {
      const entries = parse('PATH="C:\\\\Users"');
      expect(entries[0].value).toBe('C:\\Users');
    });

    it('handles \\" escape in double-quoted values', () => {
      const entries = parse('MSG="say \\"hi\\""');
      expect(entries[0].value).toBe('say "hi"');
    });

    it('parses single-quoted values as literals', () => {
      const entries = parse("MSG='hello\\nworld'");
      expect(entries[0].value).toBe('hello\\nworld');
      expect(entries[0].quoteStyle).toBe('single');
    });

    it('parses unquoted values with trimming', () => {
      const entries = parse('KEY=  hello world  ');
      expect(entries[0].value).toBe('hello world');
    });

    it('handles inline comments in unquoted values', () => {
      const entries = parse('KEY=value # this is a comment');
      expect(entries[0].value).toBe('value');
    });

    it('does not treat # without preceding whitespace as comment in unquoted', () => {
      const entries = parse('COLOR=#ffffff');
      expect(entries[0].value).toBe('#ffffff');
    });

    it('parses comment lines', () => {
      const entries = parse('# This is a comment');
      expect(entries[0]).toEqual({
        type: 'comment',
        raw: '# This is a comment',
      });
    });

    it('parses comment lines with leading whitespace', () => {
      const entries = parse('  # indented comment');
      expect(entries[0].type).toBe('comment');
    });

    it('parses blank lines', () => {
      const entries = parse('');
      expect(entries[0]).toEqual({
        type: 'blank',
        raw: '',
      });
    });

    it('preserves unknown lines', () => {
      const entries = parse('this is not a valid env line!');
      expect(entries[0]).toEqual({
        type: 'unknown',
        raw: 'this is not a valid env line!',
      });
    });

    it('parses multi-line double-quoted values', () => {
      const content = 'MSG="hello\nworld"';
      const entries = parse(content);
      expect(entries[0].value).toBe('hello\nworld');
      expect(entries[0].quoteStyle).toBe('double');
      expect(entries[0].raw).toBe('MSG="hello\nworld"');
    });

    it('parses multi-line single-quoted values', () => {
      const content = "MSG='hello\nworld'";
      const entries = parse(content);
      expect(entries[0].value).toBe('hello\nworld');
      expect(entries[0].quoteStyle).toBe('single');
      expect(entries[0].raw).toBe("MSG='hello\nworld'");
    });

    it('parses a complete .env file', () => {
      const content = [
        '# Database config',
        'DB_HOST=localhost',
        'DB_PORT=5432',
        '',
        'export API_KEY="secret123"',
        "PASSWORD='p@ss'",
      ].join('\n');

      const entries = parse(content);
      expect(entries).toHaveLength(6);
      expect(entries[0].type).toBe('comment');
      expect(entries[1]).toMatchObject({ type: 'keyvalue', key: 'DB_HOST', value: 'localhost' });
      expect(entries[2]).toMatchObject({ type: 'keyvalue', key: 'DB_PORT', value: '5432' });
      expect(entries[3].type).toBe('blank');
      expect(entries[4]).toMatchObject({ type: 'keyvalue', key: 'API_KEY', value: 'secret123', exported: true });
      expect(entries[5]).toMatchObject({ type: 'keyvalue', key: 'PASSWORD', value: 'p@ss' });
    });

    it('parses multi-line double-quoted with escapes', () => {
      const content = 'CERT="line1\\n\nline2"';
      const entries = parse(content);
      expect(entries[0].value).toBe('line1\n\nline2');
    });

    it('handles empty quoted values', () => {
      const entries = parse('EMPTY=""');
      expect(entries[0].value).toBe('');
      expect(entries[0].quoteStyle).toBe('double');
    });

    it('handles empty single-quoted values', () => {
      const entries = parse("EMPTY=''");
      expect(entries[0].value).toBe('');
      expect(entries[0].quoteStyle).toBe('single');
    });

    it('handles empty unquoted values', () => {
      const entries = parse('EMPTY=');
      expect(entries[0].value).toBe('');
      expect(entries[0].quoteStyle).toBe('none');
    });

    it('handles keys starting with underscore', () => {
      const entries = parse('_PRIVATE=secret');
      expect(entries[0].key).toBe('_PRIVATE');
    });
  });

  describe('stringify', () => {
    it('joins entries by raw field with newlines', () => {
      const entries = parse('FOO=bar\n# comment\n\nBAZ=qux');
      const result = stringify(entries);
      expect(result).toBe('FOO=bar\n# comment\n\nBAZ=qux');
    });

    it('round-trips a complete .env file', () => {
      const content = [
        '# Config',
        'export DB_URL="postgres://localhost:5432/db"',
        '',
        'SECRET=abc123',
        "QUOTED='no escapes here \\n'",
      ].join('\n');

      const entries = parse(content);
      expect(stringify(entries)).toBe(content);
    });

    it('preserves multi-line values in round-trip', () => {
      const content = 'CERT="-----BEGIN CERT-----\nabc\n-----END CERT-----"';
      const entries = parse(content);
      expect(stringify(entries)).toBe(content);
    });
  });

  describe('toMap', () => {
    it('extracts key-value pairs into a Map', () => {
      const entries = parse('FOO=bar\nBAZ=qux');
      const map = toMap(entries);
      expect(map.get('FOO')).toBe('bar');
      expect(map.get('BAZ')).toBe('qux');
    });

    it('ignores comments and blank lines', () => {
      const entries = parse('# comment\n\nFOO=bar');
      const map = toMap(entries);
      expect(map.size).toBe(1);
      expect(map.get('FOO')).toBe('bar');
    });

    it('later duplicates overwrite earlier ones', () => {
      const entries = parse('KEY=first\nKEY=second');
      const map = toMap(entries);
      expect(map.get('KEY')).toBe('second');
    });

    it('ignores unknown lines', () => {
      const entries = parse('not valid\nFOO=bar');
      const map = toMap(entries);
      expect(map.size).toBe(1);
    });
  });
});
