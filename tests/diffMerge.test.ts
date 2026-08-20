import { describe, it, expect, vi, afterEach } from 'vitest';
import { diff, applyMerge, formatValue } from '../src/diffMerge.js';
import type { EnvEntry, NewKey, ChangedKey } from '../src/types.js';

describe('diff', () => {
  it('categorizes keys present only in incoming as newKeys', () => {
    const existing = new Map([['A', 'val1']]);
    const incoming = new Map([['A', 'val1'], ['B', 'val2']]);
    const result = diff(existing, incoming);
    expect(result.newKeys).toEqual([{ key: 'B', value: 'val2' }]);
    expect(result.changedKeys).toEqual([]);
    expect(result.unchangedKeys).toEqual([{ key: 'A', value: 'val1' }]);
  });

  it('categorizes keys with different trimmed values as changedKeys', () => {
    const existing = new Map([['A', 'old']]);
    const incoming = new Map([['A', 'new']]);
    const result = diff(existing, incoming);
    expect(result.changedKeys).toEqual([
      { key: 'A', currentValue: 'old', newValue: 'new' },
    ]);
    expect(result.newKeys).toEqual([]);
    expect(result.unchangedKeys).toEqual([]);
  });

  it('categorizes keys with identical trimmed values as unchangedKeys', () => {
    const existing = new Map([['A', '  hello  ']]);
    const incoming = new Map([['A', 'hello']]);
    const result = diff(existing, incoming);
    expect(result.unchangedKeys).toEqual([{ key: 'A', value: 'hello' }]);
    expect(result.changedKeys).toEqual([]);
    expect(result.newKeys).toEqual([]);
  });

  it('handles empty maps', () => {
    const result = diff(new Map(), new Map());
    expect(result.newKeys).toEqual([]);
    expect(result.changedKeys).toEqual([]);
    expect(result.unchangedKeys).toEqual([]);
  });

  it('treats all incoming keys as new when existing is empty', () => {
    const existing = new Map<string, string>();
    const incoming = new Map([['X', '1'], ['Y', '2']]);
    const result = diff(existing, incoming);
    expect(result.newKeys).toHaveLength(2);
    expect(result.changedKeys).toHaveLength(0);
    expect(result.unchangedKeys).toHaveLength(0);
  });

  it('ignores keys in existing that are not in incoming (no deletion)', () => {
    const existing = new Map([['A', '1'], ['B', '2']]);
    const incoming = new Map([['A', '1']]);
    const result = diff(existing, incoming);
    expect(result.unchangedKeys).toEqual([{ key: 'A', value: '1' }]);
    expect(result.newKeys).toEqual([]);
    expect(result.changedKeys).toEqual([]);
  });

  it('uses trimmed comparison for change detection', () => {
    const existing = new Map([['KEY', 'value  ']]);
    const incoming = new Map([['KEY', '  value']]);
    const result = diff(existing, incoming);
    // trimmed versions are both "value", so unchanged
    expect(result.unchangedKeys).toHaveLength(1);
    expect(result.changedKeys).toHaveLength(0);
  });

  it('categorizes all keys as changed when every value differs', () => {
    const existing = new Map([['A', '1'], ['B', '2'], ['C', '3']]);
    const incoming = new Map([['A', 'x'], ['B', 'y'], ['C', 'z']]);
    const result = diff(existing, incoming);
    expect(result.changedKeys).toHaveLength(3);
    expect(result.newKeys).toHaveLength(0);
    expect(result.unchangedKeys).toHaveLength(0);
  });

  it('categorizes all keys as unchanged when values match after trim', () => {
    const existing = new Map([['A', ' v1 '], ['B', 'v2 '], ['C', ' v3']]);
    const incoming = new Map([['A', 'v1'], ['B', 'v2'], ['C', 'v3']]);
    const result = diff(existing, incoming);
    expect(result.unchangedKeys).toHaveLength(3);
    expect(result.changedKeys).toHaveLength(0);
    expect(result.newKeys).toHaveLength(0);
  });

  it('handles mixed scenario with new, changed, and unchanged keys', () => {
    const existing = new Map([['A', '1'], ['B', '2'], ['C', '3']]);
    const incoming = new Map([['A', '1'], ['B', 'changed'], ['D', 'brand_new']]);
    const result = diff(existing, incoming);
    expect(result.unchangedKeys).toEqual([{ key: 'A', value: '1' }]);
    expect(result.changedKeys).toEqual([{ key: 'B', currentValue: '2', newValue: 'changed' }]);
    expect(result.newKeys).toEqual([{ key: 'D', value: 'brand_new' }]);
  });
});

describe('applyMerge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates changed keys in-place preserving position', () => {
    const entries: EnvEntry[] = [
      { type: 'comment', raw: '# header' },
      { type: 'keyvalue', key: 'A', value: 'old', raw: 'A=old', quoteStyle: 'none' },
      { type: 'keyvalue', key: 'B', value: 'keep', raw: 'B=keep', quoteStyle: 'none' },
    ];
    const changes: ChangedKey[] = [{ key: 'A', currentValue: 'old', newValue: 'new' }];
    const result = applyMerge(entries, [], changes);
    const lines = result.split('\n');
    expect(lines[0]).toBe('# header');
    expect(lines[1]).toBe('A=new');
    expect(lines[2]).toBe('B=keep');
  });

  it('appends new keys under a dated comment header', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));

    const entries: EnvEntry[] = [
      { type: 'keyvalue', key: 'A', value: '1', raw: 'A=1', quoteStyle: 'none' },
    ];
    const newKeys: NewKey[] = [{ key: 'B', value: '2' }];
    const result = applyMerge(entries, newKeys, []);
    const lines = result.split('\n');
    expect(lines[0]).toBe('A=1');
    expect(lines[1]).toBe('# --- added by elock 2024-06-15 ---');
    expect(lines[2]).toBe('B=2');

    vi.useRealTimers();
  });

  it('preserves comments, blank lines, and key ordering', () => {
    const entries: EnvEntry[] = [
      { type: 'comment', raw: '# database config' },
      { type: 'keyvalue', key: 'DB_HOST', value: 'localhost', raw: 'DB_HOST=localhost', quoteStyle: 'none' },
      { type: 'blank', raw: '' },
      { type: 'comment', raw: '# app config' },
      { type: 'keyvalue', key: 'PORT', value: '3000', raw: 'PORT=3000', quoteStyle: 'none' },
    ];
    const result = applyMerge(entries, [], []);
    const lines = result.split('\n');
    expect(lines).toEqual([
      '# database config',
      'DB_HOST=localhost',
      '',
      '# app config',
      'PORT=3000',
    ]);
  });

  it('preserves export prefix when updating values', () => {
    const entries: EnvEntry[] = [
      { type: 'keyvalue', key: 'API_KEY', value: 'old', raw: 'export API_KEY=old', exported: true, quoteStyle: 'none' },
    ];
    const changes: ChangedKey[] = [{ key: 'API_KEY', currentValue: 'old', newValue: 'new' }];
    const result = applyMerge(entries, [], changes);
    expect(result).toBe('export API_KEY=new');
  });

  it('preserves quote style when updating values', () => {
    const entries: EnvEntry[] = [
      { type: 'keyvalue', key: 'SECRET', value: 'old', raw: "SECRET='old'", quoteStyle: 'single' },
      { type: 'keyvalue', key: 'MSG', value: 'hello', raw: 'MSG="hello"', quoteStyle: 'double' },
    ];
    const changes: ChangedKey[] = [
      { key: 'SECRET', currentValue: 'old', newValue: 'new' },
      { key: 'MSG', currentValue: 'hello', newValue: 'world' },
    ];
    const result = applyMerge(entries, [], changes);
    const lines = result.split('\n');
    expect(lines[0]).toBe("SECRET='new'");
    expect(lines[1]).toBe('MSG="world"');
  });

  it('does not append header if no new keys are accepted', () => {
    const entries: EnvEntry[] = [
      { type: 'keyvalue', key: 'A', value: '1', raw: 'A=1', quoteStyle: 'none' },
    ];
    const result = applyMerge(entries, [], []);
    expect(result).toBe('A=1');
    expect(result).not.toContain('added by elock');
  });
});

describe('formatValue', () => {
  it('wraps in single quotes for single style', () => {
    expect(formatValue('hello', 'single')).toBe("'hello'");
  });

  it('wraps in double quotes for double style', () => {
    expect(formatValue('hello', 'double')).toBe('"hello"');
  });

  it('returns value as-is for none style', () => {
    expect(formatValue('hello', 'none')).toBe('hello');
  });

  it('escapes backslashes and double quotes in double style', () => {
    expect(formatValue('path\\to\\"file"', 'double')).toBe('"path\\\\to\\\\\\"file\\""');
  });

  it('does not escape in single quote style', () => {
    expect(formatValue('it\'s a "test"', 'single')).toBe("'it's a \"test\"'");
  });
});
