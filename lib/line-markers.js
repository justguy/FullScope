// Virtual line markers — when lines are stripped, insert markers to prevent line-number drift.
// Input: array of { originalLineNumber, text } objects (some removed by recipe)
// Output: text with markers like "// ... [34 lines stripped]" at gap boundaries

export function insertLineMarkers(originalLines, keptLineNumbers) {
  if (!keptLineNumbers || keptLineNumbers.length === 0) {
    if (originalLines.length === 0) return '';
    return `// ... [${originalLines.length} lines stripped]`;
  }

  const keptSet = new Set(keptLineNumbers);
  const result = [];
  let lastKept = 0; // 0 means "before the first line"

  for (let i = 1; i <= originalLines.length; i++) {
    if (keptSet.has(i)) {
      // Check if there's a gap since the last kept line
      const gap = i - lastKept - 1;
      if (gap > 0) {
        result.push(`// ... [${gap} line${gap > 1 ? 's' : ''} stripped]`);
      }
      result.push(originalLines[i - 1]); // originalLines is 0-indexed
      lastKept = i;
    }
  }

  // Trailing gap
  const trailingGap = originalLines.length - lastKept;
  if (trailingGap > 0) {
    result.push(`// ... [${trailingGap} line${trailingGap > 1 ? 's' : ''} stripped]`);
  }

  return result.join('\n');
}

// Simpler version: given original text and filtered text (after remove_lines),
// produce output with markers. Uses line matching to detect what was removed.
export function addMarkersAfterFilter(originalText, filteredText, commentPrefix = '//') {
  const origLines = originalText.split('\n');
  const filtLines = new Set(filteredText.split('\n').map(l => l.trimEnd()));

  const result = [];
  let strippedCount = 0;

  for (const line of origLines) {
    if (filtLines.has(line.trimEnd())) {
      if (strippedCount > 0) {
        result.push(`${commentPrefix} ... [${strippedCount} line${strippedCount > 1 ? 's' : ''} stripped]`);
        strippedCount = 0;
      }
      result.push(line);
    } else {
      strippedCount++;
    }
  }

  if (strippedCount > 0) {
    result.push(`${commentPrefix} ... [${strippedCount} line${strippedCount > 1 ? 's' : ''} stripped]`);
  }

  return result.join('\n');
}
