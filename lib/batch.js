// Task-centric batch context: intent-based filtering, information density budget
// allocation, cross-file import dedup, and dependency-ordered output.

import { readFileSync } from 'fs';
import { applyRecipe, recipeForExt, getExt } from './recipes.js';
import { getRecipe } from './builtin-recipes.js';
import { skeletonize } from './skeleton.js';
import { extractImportsExports, formatImportExportHeader } from './imports.js';
import { estimateTokens, savingsHeader, EDIT_SAFETY_FOOTER, trackRead } from './tokens.js';

// ─── Intent-biased recipe ───

function biasRecipeForIntent(recipe, intent) {
  if (!intent) return recipe;

  // Extract meaningful keywords from intent string
  const stopWords = new Set([
    'the', 'and', 'for', 'how', 'what', 'where', 'find', 'understand',
    'show', 'see', 'look', 'get', 'are', 'is', 'this', 'that', 'with',
    'from', 'into', 'about', 'does', 'why', 'which', 'all', 'any',
  ]);
  const words = intent
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  if (words.length === 0) return recipe;

  // Build a regex that matches any intent keyword (case-insensitive)
  const intentPattern = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const intentRegex = new RegExp(intentPattern, 'i');

  // Clone recipe and modify remove_lines:
  // Wrap each remove pattern so that lines matching BOTH the remove pattern
  // AND an intent keyword are preserved (intent wins over stripping).
  const biased = { ...recipe };
  if (biased.remove_lines && biased.remove_lines.length > 0) {
    biased._intent_preserve = intentRegex;
  }

  return biased;
}

// Apply recipe with intent preservation: lines matching intent keywords
// survive even if they would otherwise be stripped by remove_lines.
function applyRecipeWithIntent(text, recipe) {
  if (!recipe || !recipe._intent_preserve) {
    return applyRecipe(text, recipe);
  }

  const intentRegex = recipe._intent_preserve;
  const cleanRecipe = { ...recipe };
  delete cleanRecipe._intent_preserve;

  // Split into lines, apply remove_lines manually with intent override
  const lines = text.split('\n');
  const removePatterns = (cleanRecipe.remove_lines || []).map(p => new RegExp(p));
  const kept = [];

  for (const line of lines) {
    const wouldRemove = removePatterns.some(re => re.test(line));
    if (wouldRemove && intentRegex.test(line)) {
      // Intent keyword found — preserve this line despite remove pattern
      kept.push(line);
    } else if (wouldRemove) {
      continue;
    } else {
      kept.push(line);
    }
  }

  // Apply remaining pipeline steps (skip remove_lines since we handled it)
  const withoutRemove = { ...cleanRecipe };
  delete withoutRemove.remove_lines;
  return applyRecipe(kept.join('\n'), withoutRemove);
}

// ─── Compress a file with recipe ───

function compressFileContent(filePath, offset, limit, intent) {
  const raw = readFileSync(filePath, 'utf-8');
  const ext = getExt(filePath);
  const recipeName = recipeForExt(ext);
  let recipe = getRecipe(recipeName);

  if (intent) {
    recipe = biasRecipeForIntent(recipe, intent);
  }

  const lines = raw.split('\n');
  const start = (offset || 1) - 1;
  const count = limit || lines.length;
  const slice = lines.slice(start, start + count);

  const numbered = slice.map((line, i) => `${String(start + i + 1).padStart(6)} ${line}`).join('\n');
  // Use intent-aware filtering when intent is active
  const filtered = recipe._intent_preserve
    ? applyRecipeWithIntent(numbered, recipe)
    : applyRecipe(numbered, recipe);

  return { raw: numbered, filtered, rawTokens: estimateTokens(numbered), filteredTokens: estimateTokens(filtered) };
}

function skeletonizeFileContent(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const ext = getExt(filePath);
  const ie = extractImportsExports(raw, ext);
  const commentPfx = getCommentPrefix(ext);
  const ieHeader = formatImportExportHeader(ie, commentPfx);

  let skeleton = skeletonize(raw, ext);
  skeleton = skeleton.replace(/\n{3,}/g, '\n\n');

  const lines = skeleton.split('\n');
  const numbered = lines.map((line, i) => `${String(i + 1).padStart(6)} ${line}`).join('\n');

  const parts = [];
  if (ieHeader) parts.push(ieHeader);
  parts.push(numbered);

  const content = parts.join('\n');
  return { content, rawTokens: estimateTokens(raw), filteredTokens: estimateTokens(content) };
}

function getCommentPrefix(ext) {
  const hashLangs = new Set(['py', 'pyw', 'pyi', 'rb', 'sh', 'bash', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'tf', 'tfvars', 'hcl']);
  if (hashLangs.has(ext)) return '#';
  if (ext === 'html' || ext === 'htm' || ext === 'xml') return '<!--';
  if (ext === 'css' || ext === 'scss' || ext === 'less') return '/*';
  return '//';
}

// ─── Information density estimation ───

function estimateDensity(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const ext = getExt(filePath);
    const recipeName = recipeForExt(ext);
    const recipe = getRecipe(recipeName);
    const filtered = applyRecipe(raw, recipe);

    const rawTokens = estimateTokens(raw);
    const filteredTokens = estimateTokens(filtered);
    if (rawTokens === 0) return 1;

    // Compression ratio: lower = more compressible = less dense = less valuable
    return filteredTokens / rawTokens;
  } catch {
    return 0.5; // default
  }
}

// ─── Cross-file import dedup ───

function deduplicateImports(fileResults) {
  if (fileResults.length < 2) return fileResults;

  // Track imports seen so far
  const seenImports = new Map(); // import line → first file that showed it

  for (let i = 0; i < fileResults.length; i++) {
    const fr = fileResults[i];
    if (!fr.imports || fr.imports.length === 0) continue;

    if (i === 0) {
      // First file: record all its imports
      for (const imp of fr.imports) {
        seenImports.set(imp, fr.filePath);
      }
    } else {
      // Subsequent files: check for overlap
      const shared = fr.imports.filter(imp => seenImports.has(imp));
      const unique = fr.imports.filter(imp => !seenImports.has(imp));

      if (shared.length > 0) {
        const sourceFile = seenImports.get(shared[0]);
        const shortSource = sourceFile.split('/').pop();
        fr.importNote = `(imports: same as ${shortSource}${unique.length > 0 ? ' + { ' + unique.join(', ') + ' }' : ''})`;
      }

      // Record new imports
      for (const imp of unique) {
        seenImports.set(imp, fr.filePath);
      }
    }
  }

  return fileResults;
}

// ─── Topological sort by imports ───

function topologicalSort(files) {
  if (files.length < 2) return files;

  // Build adjacency: file A depends on file B if A imports something from B
  const fileSet = new Set(files.map(f => f.file_path));
  const deps = new Map(); // file → Set of files it depends on
  const importData = new Map();

  for (const f of files) {
    deps.set(f.file_path, new Set());
    try {
      const raw = readFileSync(f.file_path, 'utf-8');
      const ext = getExt(f.file_path);
      const ie = extractImportsExports(raw, ext);
      importData.set(f.file_path, ie);

      // Resolve relative imports to absolute paths in our file set
      for (const imp of ie.imports) {
        for (const other of fileSet) {
          if (other === f.file_path) continue;
          // Rough matching: does the import string relate to the other file?
          const otherBase = other.split('/').pop().replace(/\.\w+$/, '');
          if (imp.includes(otherBase)) {
            deps.get(f.file_path).add(other);
          }
        }
      }
    } catch {
      importData.set(f.file_path, { imports: [], exports: [] });
    }
  }

  // Kahn's algorithm
  const inDegree = new Map();
  for (const f of files) inDegree.set(f.file_path, 0);
  for (const [, fileDeps] of deps) {
    for (const d of fileDeps) {
      inDegree.set(d, (inDegree.get(d) || 0) + 1);
    }
  }

  const queue = [];
  for (const [path, deg] of inDegree) {
    if (deg === 0) queue.push(path);
  }

  const sorted = [];
  const visited = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    sorted.push(current);

    for (const [path, fileDeps] of deps) {
      if (fileDeps.has(current) && !visited.has(path)) {
        inDegree.set(path, (inDegree.get(path) || 0) - 1);
        if (inDegree.get(path) <= 0) queue.push(path);
      }
    }
  }

  // Add any remaining (cycles)
  for (const f of files) {
    if (!visited.has(f.file_path)) sorted.push(f.file_path);
  }

  // Reorder files array to match sorted order
  const fileMap = new Map(files.map(f => [f.file_path, f]));
  return sorted.map(path => fileMap.get(path)).filter(Boolean);
}

// ─── Main batch function ───

export function batchContext(files, options = {}) {
  const { max_total_tokens: budget = Infinity, intent } = options;

  if (!files || files.length === 0) {
    return { header: '[fullscope_batch: 0 files]', results: [] };
  }

  // 1. Topological sort (dependency-ordered)
  let ordered = topologicalSort(files);

  // 2. Information density estimation for budget allocation
  const densities = new Map();
  if (budget < Infinity) {
    for (const f of ordered) {
      densities.set(f.file_path, estimateDensity(f.file_path));
    }
  }

  // 3. Sort by priority within dependency order: high priority first
  const priorityOrder = { high: 0, normal: 1, low: 2 };
  const highPriority = ordered.filter(f => f.priority === 'high');
  const rest = ordered.filter(f => f.priority !== 'high');

  // High priority files first, then dependency-ordered rest
  ordered = [...highPriority, ...rest];

  // 4. Process each file
  let tokensUsed = 0;
  const fileResults = [];

  for (const f of ordered) {
    try {
      const isHighPriority = f.priority === 'high';
      const budgetRemaining = budget - tokensUsed;
      const density = densities.get(f.file_path) || 0.5;

      let content, mode, rawTokens, filteredTokens;

      // Decide mode based on budget and density
      const shouldSkeleton = !isHighPriority && (
        budgetRemaining < 500 ||
        (budget < Infinity && density < 0.3) // highly compressible = low density = skeleton is fine
      );

      if (shouldSkeleton) {
        const result = skeletonizeFileContent(f.file_path);
        content = result.content;
        rawTokens = result.rawTokens;
        filteredTokens = result.filteredTokens;
        mode = density < 0.3 ? 'skeleton (low-density)' : 'skeleton (budget-limited)';
      } else {
        const result = compressFileContent(f.file_path, f.offset, f.limit, intent);
        content = result.filtered;
        rawTokens = result.rawTokens;
        filteredTokens = result.filteredTokens;
        mode = 'context';

        // If over budget and not high priority, downshift
        if (!isHighPriority && tokensUsed + filteredTokens > budget) {
          const skelResult = skeletonizeFileContent(f.file_path);
          content = skelResult.content;
          rawTokens = skelResult.rawTokens;
          filteredTokens = skelResult.filteredTokens;
          mode = 'skeleton (budget-downshifted)';
        }
      }

      trackRead(f.file_path, mode, rawTokens, filteredTokens);
      tokensUsed += filteredTokens;

      // Extract imports for cross-file dedup
      let imports = [];
      try {
        const raw = readFileSync(f.file_path, 'utf-8');
        const ext = getExt(f.file_path);
        const ie = extractImportsExports(raw, ext);
        imports = ie.imports;
      } catch {}

      fileResults.push({
        filePath: f.file_path,
        content,
        mode,
        tokens: filteredTokens,
        imports,
        importNote: null,
      });
    } catch (e) {
      fileResults.push({
        filePath: f.file_path,
        content: e.message,
        mode: 'error',
        tokens: 0,
        imports: [],
        importNote: null,
      });
    }
  }

  // 5. Cross-file import dedup
  deduplicateImports(fileResults);

  // 6. Format output
  const parts = [];
  for (const fr of fileResults) {
    let header = `\u2550\u2550\u2550 ${fr.filePath} [${fr.mode}] \u2550\u2550\u2550`;
    if (fr.importNote) {
      header += `\n// ${fr.importNote}`;
    }
    parts.push(`${header}\n${fr.content}${EDIT_SAFETY_FOOTER}`);
  }

  const batchHeader = `[fullscope_batch: ${files.length} files, ~${tokensUsed.toLocaleString()} tokens used${budget < Infinity ? ` / ${budget.toLocaleString()} budget` : ''}${intent ? ` | intent: "${intent}"` : ''}]`;

  return {
    header: batchHeader,
    text: batchHeader + '\n\n' + parts.join('\n\n'),
  };
}
