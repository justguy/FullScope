#!/usr/bin/env node
/**
 * fullscope demo — shows skeleton → expand → savings on a bundled fixture.
 * Run: npx fullscope --demo   or   node scripts/demo.js
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { applyRecipe, recipeForExt, getExt } from '../lib/recipes.js';
import { getRecipe } from '../lib/builtin-recipes.js';
import { skeletonize } from '../lib/skeleton.js';
import { expandFunction } from '../lib/expand.js';
import { estimateTokens } from '../lib/tokens.js';

const ROOT = join(import.meta.dirname, '..');
const FIXTURE = join(ROOT, 'test/fixtures/auth-service.js');

export async function runDemo() {
  // Use fixture if available, otherwise use index.js
  const file = existsSync(FIXTURE) ? FIXTURE : join(ROOT, 'index.js');
  const fileName = file.split('/').pop();

  const raw = readFileSync(file, 'utf-8');
  const ext = getExt(file);
  const rawTokens = estimateTokens(raw);
  const lines = raw.split('\n').length;

  console.log(`\n  fullscope demo\n`);
  console.log(`  File: ${fileName} (${lines} lines, ${rawTokens} tokens)\n`);

  // Step 1: Skeleton
  console.log('  ── Step 1: fullscope_skeleton ──\n');
  const skeleton = skeletonize(raw, ext);
  const skelTokens = estimateTokens(skeleton);
  const skelLines = skeleton.split('\n').filter(l => l.trim()).length;
  const skelPct = Math.round((1 - skelTokens / rawTokens) * 100);

  // Show skeleton (trimmed)
  const skelOutput = skeleton.split('\n').filter(l => l.trim()).slice(0, 20);
  for (const line of skelOutput) {
    console.log(`  ${line}`);
  }
  if (skelLines > 20) console.log(`  ... (${skelLines - 20} more lines)`);
  console.log(`\n  → ${skelTokens} tokens (${skelPct}% saved)\n`);

  // Step 2: Expand a function
  // Pick a specific function to expand — try common method names that exist in the file
  const candidates = ['login', 'handle_request', 'register', 'main', 'start', 'run'];
  let fnName = null;
  for (const c of candidates) {
    // Check if function exists in raw file (brace-delimited or Python def)
    if (raw.includes(`function ${c}(`) || raw.includes(`async ${c}(`) ||
        raw.includes(`def ${c}(`) || raw.includes(`async def ${c}(`)) {
      fnName = c;
      break;
    }
  }
  // Fallback: use first skeleton handle
  if (!fnName) {
    const handleMatch2 = skeleton.match(/expand: fn:(\w+)/);
    if (handleMatch2) fnName = handleMatch2[1];
  }
  const handleMatch = fnName ? [null, fnName] : null;
  if (handleMatch) {
    const fnName = handleMatch[1];
    console.log(`  ── Step 2: fullscope_expand fn:${fnName} ──\n`);

    const expanded = expandFunction(file, `fn:${fnName}`);
    const expandedLines = expanded.split('\n');
    const expandTokens = estimateTokens(expanded);

    // Show first 15 lines
    for (const line of expandedLines.slice(0, 15)) {
      console.log(`  ${line}`);
    }
    if (expandedLines.length > 15) console.log(`  ... (${expandedLines.length - 15} more lines)`);
    console.log(`\n  → ${expandTokens} tokens for just this function\n`);

    // Summary
    const totalFs = skelTokens + expandTokens;
    const totalPct = Math.round((1 - totalFs / rawTokens) * 100);

    console.log('  ── Result ──\n');
    console.log(`  Raw read:     ${rawTokens} tokens (1 call)`);
    console.log(`  fullscope flow:     ${totalFs} tokens (2 calls: skeleton + expand)`);
    console.log(`  Saved:        ${totalPct}%\n`);
    console.log('  Same answer. Fewer tokens. Targeted reads.\n');
  } else {
    // No expand handle (e.g. data-heavy file)
    console.log('  ── Result ──\n');
    console.log(`  Raw read:     ${rawTokens} tokens`);
    console.log(`  Skeleton:     ${skelTokens} tokens (${skelPct}% saved)\n`);
  }
}

// Allow direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  await runDemo();
}
