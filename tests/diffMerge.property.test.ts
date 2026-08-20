import { describe, it } from 'vitest';
import fc from 'fast-check';
import { diff, applyMerge } from '../src/diffMerge.js';
import type { EnvEntry, NewKey, ChangedKey } from '../src/types.js';

// Generator for Map<string, string>
const stringMap = fc.array(
  fc.tuple(
    fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ_'.split('')), { minLength: 1, maxLength: 10 }),
    fc.string({ minLength: 0, maxLength: 20 })
  ),
  { minLength: 0, maxLength: 15 }
).map(pairs => new Map(pairs));

// Generator for EnvEntry arrays with diverse entry types
const envEntryArb: fc.Arbitrary<EnvEntry> = fc.oneof(
  fc.record({
    type: fc.constant('comment' as const),
    raw: fc.tuple(fc.constant('# '), fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz '.split('')), { minLength: 1, maxLength: 20 }))
      .map(([prefix, text]) => prefix + text.replace(/\n/g, '')),
  }),
  fc.record({
    type: fc.constant('blank' as const),
    raw: fc.constant(''),
  }),
  fc.record({
    type: fc.constant('keyvalue' as const),
    key: fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ_'.split('')), { minLength: 1, maxLength: 8 }),
    value: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 15 }),
    raw: fc.constant(''), // Computed below
    exported: fc.boolean(),
    quoteStyle: fc.constantFrom('none' as const, 'single' as const, 'double' as const),
  }).map(entry => ({
    ...entry,
    raw: `${entry.exported ? 'export ' : ''}${entry.key}=${entry.value}`,
  })),
);

describe('diffMerge properties', () => {
  it('Property 5: diff exhaustive partitioning', () => {
    /**
     * Validates: Requirements 4.1, 10.4
     *
     * For any two key-value maps (existing and incoming), calling diff(existing, incoming)
     * SHALL produce three buckets (newKeys, changedKeys, unchangedKeys) where:
     * (a) every key in the incoming map appears in exactly one bucket,
     * (b) no key appears in more than one bucket, and
     * (c) the total count of keys across all buckets equals the number of keys in the incoming map.
     */
    fc.assert(
      fc.property(stringMap, stringMap, (existing, incoming) => {
        const result = diff(existing, incoming);

        const allKeys = new Set([
          ...result.newKeys.map(k => k.key),
          ...result.changedKeys.map(k => k.key),
          ...result.unchangedKeys.map(k => k.key),
        ]);

        // (a) Every key in incoming appears in exactly one bucket
        for (const key of incoming.keys()) {
          if (!allKeys.has(key)) return false;
        }

        // (b) No key appears in more than one bucket (total count == set size)
        const totalCount = result.newKeys.length + result.changedKeys.length + result.unchangedKeys.length;
        if (totalCount !== allKeys.size) return false;

        // (c) Total count equals number of keys in incoming
        if (totalCount !== incoming.size) return false;

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('Property 6: merge structural preservation', () => {
    /**
     * Validates: Requirements 4.5, 4.6, 4.8, 10.5
     *
     * For any list of existing EnvEntry elements and any set of merge decisions
     * (accepted new keys and accepted changes), calling applyMerge() SHALL produce
     * output that:
     * (a) preserves all non-keyvalue entries (comments, blanks) in their original order,
     * (b) preserves all keyvalue entries that are not in the acceptedChanges list at
     *     their original position,
     * (c) does not remove any existing entries.
     */
    fc.assert(
      fc.property(
        fc.array(envEntryArb, { minLength: 1, maxLength: 10 }),
        fc.array(
          fc.record({
            key: fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ_'.split('')), { minLength: 1, maxLength: 8 }),
            value: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 15 }),
          }),
          { minLength: 0, maxLength: 3 }
        ),
        (entries, acceptedNewRaw) => {
          // Deduplicate keys in entries to avoid ambiguity
          const seenKeys = new Set<string>();
          const dedupedEntries: EnvEntry[] = [];
          for (const entry of entries) {
            if (entry.type === 'keyvalue' && entry.key) {
              if (seenKeys.has(entry.key)) continue;
              seenKeys.add(entry.key);
            }
            dedupedEntries.push(entry);
          }

          // Build acceptedNew: only keys not already in entries
          const existingKeys = new Set(
            dedupedEntries.filter(e => e.type === 'keyvalue' && e.key).map(e => e.key!)
          );
          const acceptedNew: NewKey[] = acceptedNewRaw
            .filter(n => !existingKeys.has(n.key))
            .filter((n, i, arr) => arr.findIndex(x => x.key === n.key) === i);

          // Pick a subset of existing keyvalue entries as acceptedChanges
          const keyvalueEntries = dedupedEntries.filter(e => e.type === 'keyvalue' && e.key);
          const acceptedChanges: ChangedKey[] = keyvalueEntries
            .slice(0, Math.min(2, keyvalueEntries.length))
            .map(e => ({
              key: e.key!,
              currentValue: e.value ?? '',
              newValue: 'changed_' + (e.value ?? ''),
            }));

          const result = applyMerge(dedupedEntries, acceptedNew, acceptedChanges);
          const outputLines = result.split('\n');

          // (a) Verify all comment and blank entries appear in output in their original order
          const inputNonKV = dedupedEntries
            .filter(e => e.type === 'comment' || e.type === 'blank')
            .map(e => e.raw);

          let searchIdx = 0;
          for (const raw of inputNonKV) {
            let found = false;
            while (searchIdx < outputLines.length) {
              if (outputLines[searchIdx] === raw) {
                found = true;
                searchIdx++;
                break;
              }
              searchIdx++;
            }
            if (!found) return false;
          }

          // (b) Verify keyvalue entries NOT in acceptedChanges keep their raw content
          const changedKeySet = new Set(acceptedChanges.map(c => c.key));
          const unchangedKV = dedupedEntries
            .filter(e => e.type === 'keyvalue' && e.key && !changedKeySet.has(e.key))
            .map(e => e.raw);

          for (const raw of unchangedKV) {
            if (!outputLines.includes(raw)) return false;
          }

          // (c) No existing entries are removed: output lines >= input entries count
          // (acceptedNew adds lines, nothing is removed)
          if (outputLines.length < dedupedEntries.length) return false;

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
