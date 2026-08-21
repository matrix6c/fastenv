import type { DiffResult, EnvEntry, NewKey, ChangedKey, QuoteStyle } from './types.js';

/**
 * Categorizes keys into new, changed, and unchanged buckets.
 * Values are compared as trimmed strings.
 */
export function diff(
  existing: Map<string, string>,
  incoming: Map<string, string>
): DiffResult {
  const newKeys: DiffResult['newKeys'] = [];
  const changedKeys: DiffResult['changedKeys'] = [];
  const unchangedKeys: DiffResult['unchangedKeys'] = [];

  for (const [key, value] of incoming) {
    const existingValue = existing.get(key);
    if (existingValue === undefined) {
      newKeys.push({ key, value });
    } else if (existingValue.trim() !== value.trim()) {
      changedKeys.push({ key, currentValue: existingValue, newValue: value });
    } else {
      unchangedKeys.push({ key, value });
    }
  }

  return { newKeys, changedKeys, unchangedKeys };
}

/**
 * Applies merge decisions to produce final .env content.
 * - Accepted changes are updated in-place at their original position
 * - Accepted new keys are appended under a dated comment header
 * - All other structural elements (comments, blanks, unchanged keys) are preserved
 */
export function applyMerge(
  existingEntries: EnvEntry[],
  acceptedNew: NewKey[],
  acceptedChanges: ChangedKey[]
): string {
  const changeMap = new Map(acceptedChanges.map((c) => [c.key, c.newValue]));
  const lines: string[] = [];

  for (const entry of existingEntries) {
    if (entry.type === 'keyvalue' && entry.key && changeMap.has(entry.key)) {
      // Update value in-place, preserving quote style and export prefix
      const newValue = changeMap.get(entry.key)!;
      const prefix = entry.exported ? 'export ' : '';
      const quoted = formatValue(newValue, entry.quoteStyle ?? 'none');
      lines.push(`${prefix}${entry.key}=${quoted}`);
    } else {
      lines.push(entry.raw);
    }
  }

  if (acceptedNew.length > 0) {
    const date = new Date().toISOString().split('T')[0];
    lines.push(`# --- added by fastenv ${date} ---`);
    for (const { key, value } of acceptedNew) {
      lines.push(`${key}=${value}`);
    }
  }

  return lines.join('\n');
}

/**
 * Formats a value with the specified quote style.
 * - 'single': wraps in single quotes (no escape processing)
 * - 'double': wraps in double quotes with backslash and quote escaping
 * - 'none': returns value as-is
 */
export function formatValue(value: string, quoteStyle: QuoteStyle): string {
  switch (quoteStyle) {
    case 'single':
      return `'${value}'`;
    case 'double':
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    default:
      return value;
  }
}
