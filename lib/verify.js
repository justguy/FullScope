// fullscope_verify_line: re-anchor compressed line numbers to raw file.
// Takes a file path + line number (from compressed output), returns raw context.
// Optionally accepts a content snippet to verify the line matches expectations.
// Since compressed output preserves original line numbers via virtual markers,
// the line number from compressed output IS the raw line number.

import { readFileSync } from 'fs';

export function verifyLine(filePath, lineNumber, expectedContent, contextSize = 5) {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n');

    if (lineNumber < 1 || lineNumber > lines.length) {
      return `Line ${lineNumber} is out of range (file has ${lines.length} lines)`;
    }

    const start = Math.max(0, lineNumber - 1 - contextSize);
    const end = Math.min(lines.length, lineNumber + contextSize);
    const slice = lines.slice(start, end);

    const numbered = slice.map((line, i) => {
      const num = start + i + 1;
      const marker = num === lineNumber ? ' >>>' : '    ';
      return `${String(num).padStart(6)}${marker} ${line}`;
    });

    const parts = [`Raw file: ${filePath} (line ${lineNumber})`];

    // If expected content was provided, verify it matches
    if (expectedContent) {
      const actualLine = lines[lineNumber - 1].trim();
      const expected = expectedContent.trim();
      if (actualLine.includes(expected) || expected.includes(actualLine)) {
        parts.push(`Match: confirmed — line ${lineNumber} contains "${expected.slice(0, 60)}"`);
      } else {
        parts.push(`Mismatch: line ${lineNumber} is "${actualLine.slice(0, 80)}", expected "${expected.slice(0, 80)}"`);
        parts.push('The compressed view may have shifted. Search the raw file for the expected content.');
      }
    }

    parts.push(numbered.join('\n'));
    return parts.join('\n');
  } catch (e) {
    return `Error reading ${filePath}: ${e.message}`;
  }
}
