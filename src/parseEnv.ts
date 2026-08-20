import type { EnvEntry, QuoteStyle } from './types.js';

/**
 * Parses .env file content into structured entries.
 * Handles KEY=value pairs (with optional `export` prefix), comments, blank lines,
 * quoted values (single and double), multi-line quoted values, inline comments,
 * and unrecognized lines.
 */
export function parse(content: string): EnvEntry[] {
  const entries: EnvEntry[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === '') {
      entries.push({ type: 'blank', raw: line });
      i++;
      continue;
    }

    // Comment line (optional leading whitespace followed by #)
    if (/^\s*#/.test(line)) {
      entries.push({ type: 'comment', raw: line });
      i++;
      continue;
    }

    // KEY=value line (with optional export prefix)
    const match = line.match(/^(export\s+)?([A-Za-z_]\w*)\s*=\s*(.*)/);
    if (match) {
      const exported = !!match[1];
      const key = match[2];
      const rawValue = match[3];
      const { value, quoteStyle, rawLines } = parseValue(rawValue, lines, i);

      entries.push({
        type: 'keyvalue',
        key,
        value,
        raw: rawLines.join('\n'),
        exported,
        quoteStyle,
      });
      i += rawLines.length;
      continue;
    }

    // Unknown line - preserved as-is
    entries.push({ type: 'unknown', raw: line });
    i++;
  }

  return entries;
}

/**
 * Serializes structured entries back into .env file content.
 * Joins each entry's raw field with newlines to reconstruct the original file.
 */
export function stringify(entries: EnvEntry[]): string {
  return entries.map((entry) => entry.raw).join('\n');
}

/**
 * Extracts a key-value map from parsed entries.
 * Only includes keyvalue entries; later duplicates overwrite earlier ones.
 */
export function toMap(entries: EnvEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    if (entry.type === 'keyvalue' && entry.key !== undefined && entry.value !== undefined) {
      map.set(entry.key, entry.value);
    }
  }
  return map;
}

/**
 * Parses the value portion of a KEY=value line, handling:
 * - Single-quoted values (literal, no escape processing)
 * - Double-quoted values (with escape sequences)
 * - Multi-line quoted values (spanning multiple lines)
 * - Unquoted values (trimmed, with inline comment detection)
 */
function parseValue(
  rawValue: string,
  lines: string[],
  startLine: number
): { value: string; quoteStyle: QuoteStyle; rawLines: string[] } {
  // Double-quoted value
  if (rawValue.startsWith('"')) {
    return parseDoubleQuoted(rawValue, lines, startLine);
  }

  // Single-quoted value
  if (rawValue.startsWith("'")) {
    return parseSingleQuoted(rawValue, lines, startLine);
  }

  // Unquoted value
  return parseUnquoted(rawValue, lines[startLine]);
}

/**
 * Parses a double-quoted value, handling escape sequences and multi-line values.
 * Supported escapes: \n → newline, \r → carriage return, \\ → backslash, \" → double quote
 */
function parseDoubleQuoted(
  rawValue: string,
  lines: string[],
  startLine: number
): { value: string; quoteStyle: QuoteStyle; rawLines: string[] } {
  // Remove opening quote
  const contentAfterQuote = rawValue.slice(1);

  // Try to find closing quote on the same line
  const closeIndex = findUnescapedQuote(contentAfterQuote, '"');

  if (closeIndex !== -1) {
    // Single-line double-quoted value
    const rawContent = contentAfterQuote.slice(0, closeIndex);
    const value = expandEscapes(rawContent);
    return {
      value,
      quoteStyle: 'double',
      rawLines: [lines[startLine]],
    };
  }

  // Multi-line: continue reading until closing quote is found
  const rawParts: string[] = [contentAfterQuote];
  const rawLines: string[] = [lines[startLine]];
  let i = startLine + 1;

  while (i < lines.length) {
    rawLines.push(lines[i]);
    const lineContent = lines[i];
    const closeIdx = findUnescapedQuote(lineContent, '"');

    if (closeIdx !== -1) {
      rawParts.push(lineContent.slice(0, closeIdx));
      break;
    }

    rawParts.push(lineContent);
    i++;
  }

  const rawContent = rawParts.join('\n');
  const value = expandEscapes(rawContent);

  return {
    value,
    quoteStyle: 'double',
    rawLines,
  };
}

/**
 * Parses a single-quoted value (literal, no escape processing).
 * Handles multi-line single-quoted values.
 */
function parseSingleQuoted(
  rawValue: string,
  lines: string[],
  startLine: number
): { value: string; quoteStyle: QuoteStyle; rawLines: string[] } {
  // Remove opening quote
  const contentAfterQuote = rawValue.slice(1);

  // Try to find closing single quote on the same line
  const closeIndex = contentAfterQuote.indexOf("'");

  if (closeIndex !== -1) {
    // Single-line single-quoted value
    const value = contentAfterQuote.slice(0, closeIndex);
    return {
      value,
      quoteStyle: 'single',
      rawLines: [lines[startLine]],
    };
  }

  // Multi-line: continue reading until closing single quote is found
  const rawParts: string[] = [contentAfterQuote];
  const rawLines: string[] = [lines[startLine]];
  let i = startLine + 1;

  while (i < lines.length) {
    rawLines.push(lines[i]);
    const lineContent = lines[i];
    const closeIdx = lineContent.indexOf("'");

    if (closeIdx !== -1) {
      rawParts.push(lineContent.slice(0, closeIdx));
      break;
    }

    rawParts.push(lineContent);
    i++;
  }

  // Literal content, no escape processing
  const value = rawParts.join('\n');

  return {
    value,
    quoteStyle: 'single',
    rawLines,
  };
}

/**
 * Parses an unquoted value. Trims whitespace and handles inline comments.
 * A `#` preceded by whitespace is treated as the start of an inline comment.
 */
function parseUnquoted(
  rawValue: string,
  fullLine: string
): { value: string; quoteStyle: QuoteStyle; rawLines: string[] } {
  // Handle inline comments: # preceded by whitespace
  const commentMatch = rawValue.match(/\s+#/);
  let value: string;

  if (commentMatch && commentMatch.index !== undefined) {
    value = rawValue.slice(0, commentMatch.index).trim();
  } else {
    value = rawValue.trim();
  }

  return {
    value,
    quoteStyle: 'none',
    rawLines: [fullLine],
  };
}

/**
 * Finds the index of an unescaped quote character in a string.
 * Returns -1 if not found.
 */
function findUnescapedQuote(str: string, quote: string): number {
  let i = 0;
  while (i < str.length) {
    if (str[i] === '\\') {
      i += 2; // Skip escaped character
      continue;
    }
    if (str[i] === quote) {
      return i;
    }
    i++;
  }
  return -1;
}

/**
 * Expands escape sequences in a double-quoted string.
 * Handles: \n → newline, \r → carriage return, \\ → backslash, \" → double quote
 */
function expandEscapes(str: string): string {
  let result = '';
  let i = 0;

  while (i < str.length) {
    if (str[i] === '\\' && i + 1 < str.length) {
      const next = str[i + 1];
      switch (next) {
        case 'n':
          result += '\n';
          i += 2;
          break;
        case 'r':
          result += '\r';
          i += 2;
          break;
        case '\\':
          result += '\\';
          i += 2;
          break;
        case '"':
          result += '"';
          i += 2;
          break;
        default:
          // Unknown escape: keep as-is
          result += str[i];
          i++;
          break;
      }
    } else {
      result += str[i];
      i++;
    }
  }

  return result;
}
