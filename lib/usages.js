// Symbol usage finder — inverse dependency map.
// Given a symbol name, find where it's imported/referenced across the project.
// Searches specifically for import patterns per language, not just plain grep.

import { runSearch } from './search.js';
import { compactPath } from './path-compact.js';

// Build language-aware import/usage search patterns for a symbol
function buildImportPatterns(symbol) {
  // Each pattern targets a specific import syntax
  return [
    // JS/TS: import { symbol } from / import symbol from / require('...symbol...')
    `import\\s.*\\b${symbol}\\b`,
    `require\\(.*${symbol}`,
    // Python: from X import symbol / import symbol
    `from\\s+\\S+\\s+import\\s.*\\b${symbol}\\b`,
    // Rust: use ...::symbol
    `use\\s.*::${symbol}\\b`,
    // Java/C#: import ...symbol
    `import\\s.*\\.${symbol}\\b`,
    `using\\s.*\\.${symbol}\\b`,
    // Go: not import-level, but usage patterns
    `${symbol}\\.`,
    `${symbol}\\(`,
  ];
}

function buildCallSitePatterns(symbol) {
  return [
    // Function/method calls: symbol(, symbol.method(, new Symbol(
    `\\b${symbol}\\s*\\(`,
    `new\\s+${symbol}\\b`,
    // Property access: X.symbol, X::symbol
    `\\.${symbol}\\b`,
    `::${symbol}\\b`,
    // Type usage: : symbol, <symbol>, extends symbol
    `:\\s*${symbol}\\b`,
    `extends\\s+${symbol}\\b`,
    `implements\\s+${symbol}\\b`,
  ];
}

export function findUsages(symbol, path, maxResults = 50) {
  // Phase 1: Search for import patterns (high-confidence references)
  const importPatterns = buildImportPatterns(symbol);
  const combinedImportPattern = importPatterns.join('|');

  const importResults = runSearch(combinedImportPattern, path, null, maxResults);

  // Phase 2: Search for call sites / usages (broader but still symbol-specific)
  const callPattern = `\\b${symbol}\\b`;
  const callResults = runSearch(callPattern, path, null, maxResults);

  // Merge and deduplicate, grouping by file
  const byFile = new Map();

  function addResults(raw, tag) {
    if (!raw || raw.trim() === '') return;
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const secondColon = line.indexOf(':', colonIdx + 1);
      if (secondColon === -1) continue;
      const file = line.substring(0, colonIdx);
      const lineNum = line.substring(colonIdx + 1, secondColon);
      const content = line.substring(secondColon + 1).trim();

      const key = `${file}:${lineNum}`;
      if (!byFile.has(file)) byFile.set(file, new Map());
      const fileEntries = byFile.get(file);
      if (!fileEntries.has(key)) {
        fileEntries.set(key, { lineNum, content, isImport: tag === 'import' });
      }
    }
  }

  addResults(importResults, 'import');
  addResults(callResults, 'usage');

  if (byFile.size === 0) {
    return `No usages found for "${symbol}"`;
  }

  // Format grouped output with imports distinguished from call sites
  const lines = [`Usages of "${symbol}" (${byFile.size} files):\n`];
  for (const [file, entries] of byFile) {
    const shortPath = compactPath(file);
    const importCount = [...entries.values()].filter(e => e.isImport).length;
    const usageCount = entries.size - importCount;
    const summary = [];
    if (importCount > 0) summary.push(`${importCount} import${importCount > 1 ? 's' : ''}`);
    if (usageCount > 0) summary.push(`${usageCount} usage${usageCount > 1 ? 's' : ''}`);

    lines.push(`── ${shortPath} (${summary.join(', ')}):`);

    // Show imports first, then usages
    const sorted = [...entries.values()].sort((a, b) => a.isImport ? -1 : 1);
    for (const entry of sorted.slice(0, 8)) {
      const prefix = entry.isImport ? '  [import]' : '  [usage] ';
      lines.push(`${prefix} L${entry.lineNum}: ${entry.content.slice(0, 120)}`);
    }
    if (entries.size > 8) {
      lines.push(`  ... and ${entries.size - 8} more`);
    }
  }

  return lines.join('\n');
}
