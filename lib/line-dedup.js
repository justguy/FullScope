// Consecutive line deduplication.
// Collapses runs of identical or near-identical lines into a single line + count.
// e.g. "Processing item 1\nProcessing item 2\n..." → "Processing item 1\n[repeated 49x]"

export function deduplicateLines(text, threshold = 3) {
  if (!text) return text;

  const lines = text.split('\n');
  if (lines.length < threshold) return text;

  const result = [];
  let i = 0;

  while (i < lines.length) {
    const current = lines[i];
    const normalized = normalizeLine(current);

    // Count consecutive similar lines
    let count = 1;
    while (i + count < lines.length && isSimilar(normalized, normalizeLine(lines[i + count]))) {
      count++;
    }

    result.push(current);
    if (count >= threshold) {
      result.push(`  [repeated ${count - 1}x]`);
      i += count;
    } else {
      i++;
    }
  }

  return result.join('\n');
}

// Normalize a line for similarity comparison:
// strip numbers, timestamps, UUIDs, hex strings to find structural duplicates
function normalizeLine(line) {
  return line
    .replace(/\b\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}[.,]?\d*/g, '<TS>') // timestamps
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<UUID>') // UUIDs
    .replace(/\b0x[0-9a-f]+\b/gi, '<HEX>') // hex
    .replace(/\b\d+\b/g, '<N>') // numbers
    .trim();
}

function isSimilar(a, b) {
  return a === b;
}
