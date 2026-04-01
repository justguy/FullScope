// Per-function expand-on-demand.
// Takes a file path + function handle (from skeleton output), returns just
// that function body with context-level compression (comments stripped, logic preserved).

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { applyRecipe } from './recipes.js';
import { getRecipe } from './builtin-recipes.js';
import { recipeForExt, getExt } from './recipes.js';
import { isSignatureLine } from './skeleton.js';

// Check if a line is a method/function that could be expanded
function isExpandable(line) {
  if (isSignatureLine(line)) return true;
  const trimmed = line.trim();
  // Class methods: name(args) {  /  async name(args) {
  if (/^\s*(?:async\s+)?\w+\s*\(/.test(trimmed) && trimmed.endsWith('{')) return true;
  // TS methods with types: name(arg: Type): ReturnType {
  if (/^\s*(?:public|private|protected|static|async|override|abstract)\s/.test(trimmed) && trimmed.endsWith('{')) return true;
  // Property assigned: X.Y = function
  if (/\.\w+\s*=\s*(?:async\s+)?function/.test(trimmed) && trimmed.endsWith('{')) return true;
  return false;
}
import { estimateTokens, savingsHeader, EDIT_SAFETY_FOOTER, trackRead } from './tokens.js';

const JS_EXTS = new Set(['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts']);
const PY_EXTS = new Set(['py', 'pyw', 'pyi']);

// Find a function's line range in a brace-delimited language
function findBraceFunction(lines, fnName) {
  const namePattern = new RegExp(`\\b${escapeRegex(fnName)}\\b`);
  const commentLinePattern = /^(?:\/\/|\/\*|\*|#)/;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Check if this line contains the target function name
    if (!namePattern.test(trimmed)) continue;
    if (commentLinePattern.test(trimmed)) continue;

    // The name is here — now find the opening brace.
    // It might be on this line or a few lines later (multi-line signature).
    let braceLineIdx = -1;
    if (trimmed.endsWith('{')) {
      braceLineIdx = i;
    } else {
      // Look ahead up to 10 lines for the opening brace
      for (let k = i + 1; k < Math.min(i + 10, lines.length); k++) {
        const ahead = lines[k].trim();
        if (ahead.endsWith('{') || ahead === '{') {
          braceLineIdx = k;
          break;
        }
        // Stop if we hit another signature or a closing
        if (ahead.endsWith(';') || ahead.endsWith('}')) break;
      }
    }

    if (braceLineIdx === -1) continue;

    // Verify this is an actual signature line, not a comment or arbitrary reference.
    const sigLine = lines[i].trim();
    const braceLine = lines[braceLineIdx].trim();
    if (!isExpandable(sigLine) && !isExpandable(braceLine)) continue;
    if (/^\s*(if|else|for|while|do|switch|case|try|catch|finally|with|throw|return)\b/.test(sigLine)) continue;

    // Found the signature — count braces from the brace line to find end
    const startLine = i;
    let depth = 0;
    for (let j = braceLineIdx; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (depth <= 0) {
        return { start: startLine, end: j };
      }
    }
    return { start: startLine, end: lines.length - 1 };
  }
  return null;
}

// Find a function's line range in Python
function findPythonFunction(lines, fnName) {
  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].trim();
    const pattern = new RegExp(`^(?:async\\s+)?(?:def|class)\\s+${escapeRegex(fnName)}\\b`);
    if (!pattern.test(stripped)) continue;

    const sigIndent = lines[i].length - lines[i].trimStart().length;
    const startLine = i;

    // Body extends until a line at same or lesser indent (non-blank)
    let endLine = i;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === '') { endLine = j; continue; }
      const indent = line.length - line.trimStart().length;
      if (indent <= sigIndent) break;
      endLine = j;
    }
    return { start: startLine, end: endLine };
  }
  return null;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function expandFunction(filePath, handle) {
  // Parse handle: "fn:functionName"
  const match = handle.match(/^fn:(\w+)$/);
  if (!match) {
    return `Invalid handle format: "${handle}". Expected "fn:<functionName>"`;
  }
  const fnName = match[1];

  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');
  const ext = getExt(filePath);

  // Find function range
  let range;
  if (PY_EXTS.has(ext)) {
    range = findPythonFunction(lines, fnName);
  } else {
    range = findBraceFunction(lines, fnName);
  }

  if (!range) {
    return `Function "${fnName}" not found in ${filePath}`;
  }

  // Extract the function body
  const fnLines = lines.slice(range.start, range.end + 1);
  const numbered = fnLines
    .map((line, i) => `${String(range.start + i + 1).padStart(6)} ${line}`)
    .join('\n');

  // Apply context-level recipe (strip comments, keep logic)
  const recipeName = recipeForExt(ext);
  const recipe = getRecipe(recipeName);
  const filtered = applyRecipe(numbered, recipe);

  const rawTokens = estimateTokens(numbered);
  const filteredTokens = estimateTokens(filtered);
  trackRead(filePath, `expand:${fnName}`, rawTokens, filteredTokens);

  const header = savingsHeader(rawTokens, filteredTokens);
  return `${header}\n── ${fnName} (${filePath}, lines ${range.start + 1}-${range.end + 1}) ──\n${filtered}${EDIT_SAFETY_FOOTER}`;
}
