// JSON-aware compression.
// - compact: collapse whitespace, truncate large arrays (show first 3 + count)
// - schema: keys + types only, no values

export function compressJSON(text, mode = 'compact') {
  try {
    const parsed = JSON.parse(text);
    if (mode === 'schema') {
      return JSON.stringify(extractSchema(parsed), null, 1);
    }
    return JSON.stringify(compactValue(parsed), null, 1);
  } catch {
    // Not valid JSON — return as-is
    return text;
  }
}

function compactValue(val, depth = 0) {
  if (val === null || val === undefined) return val;

  if (Array.isArray(val)) {
    if (val.length === 0) return val;
    // For large arrays, show first 3 items + count
    if (val.length > 5) {
      const sample = val.slice(0, 3).map(v => compactValue(v, depth + 1));
      return [...sample, `... (${val.length - 3} more items, ${val.length} total)`];
    }
    return val.map(v => compactValue(v, depth + 1));
  }

  if (typeof val === 'object') {
    const result = {};
    const keys = Object.keys(val);
    for (const key of keys) {
      result[key] = compactValue(val[key], depth + 1);
    }
    return result;
  }

  // Truncate long strings
  if (typeof val === 'string' && val.length > 200) {
    return val.slice(0, 100) + `... (${val.length} chars)`;
  }

  return val;
}

function extractSchema(val, depth = 0) {
  if (val === null) return '<null>';
  if (val === undefined) return '<undefined>';

  if (Array.isArray(val)) {
    if (val.length === 0) return `<array[0]>`;
    // Show schema of first element + array length
    return { [`<array[${val.length}]>`]: extractSchema(val[0], depth + 1) };
  }

  if (typeof val === 'object') {
    if (depth > 3) return `<object(${Object.keys(val).length} keys)>`;
    const result = {};
    for (const [key, v] of Object.entries(val)) {
      result[key] = extractSchema(v, depth + 1);
    }
    return result;
  }

  // Primitive: return type
  return `<${typeof val}>`;
}
