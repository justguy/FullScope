#!/usr/bin/env node
/**
 * Integrity verification script.
 *
 * Proves that fullscope never modifies source files:
 *   1. SHA-256 hash every source file
 *   2. Run every fullscope operation (context, skeleton, expand, verify,
 *      search, usages, project, batch, markers)
 *   3. SHA-256 hash every source file again
 *   4. Compare — all must match
 *
 * Run:  node scripts/verify-integrity.js
 *       npm run verify-integrity
 *
 * Output is written to data/integrity-results.json for documentation.
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { applyRecipe, recipeForExt, getExt } from '../lib/recipes.js';
import { getRecipe } from '../lib/builtin-recipes.js';
import { skeletonize } from '../lib/skeleton.js';
import { expandFunction } from '../lib/expand.js';
import { verifyLine } from '../lib/verify.js';
import { findUsages } from '../lib/usages.js';
import { runSearch } from '../lib/search.js';
import { generateProjectOverview } from '../lib/project.js';
import { batchContext } from '../lib/batch.js';
import { addMarkersAfterFilter } from '../lib/line-markers.js';

const ROOT = join(import.meta.dirname, '..');

function hashFile(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

// ─── Collect all source files ───

const sourceFiles = [
  'index.js',
  ...readdirSync(join(ROOT, 'lib')).map(f => 'lib/' + f),
];

const fixtureFiles = [];
const fixtureDir = join(ROOT, 'test/fixtures');
if (existsSync(fixtureDir)) {
  for (const f of readdirSync(fixtureDir)) {
    fixtureFiles.push('test/fixtures/' + f);
  }
}

const allFiles = [...sourceFiles, ...fixtureFiles];

// ─── Phase 1: Hash before ───

console.log(`\n  Integrity verification\n`);
console.log(`  Phase 1: hashing ${allFiles.length} files...\n`);

const before = {};
for (const f of allFiles) {
  before[f] = hashFile(join(ROOT, f));
}

// ─── Phase 2: Run every operation ───

console.log('  Phase 2: running all operations...\n');

const operations = [];

function track(name) {
  operations.push(name);
}

// Context compression on every file
for (const f of allFiles) {
  const content = readFileSync(join(ROOT, f), 'utf-8');
  const ext = getExt(f);
  const recipe = getRecipe(recipeForExt(ext));
  applyRecipe(content, recipe);
  track(`fullscope_context(${f})`);
}

// Skeleton on every file
for (const f of allFiles) {
  const content = readFileSync(join(ROOT, f), 'utf-8');
  skeletonize(content, getExt(f));
  track(`fullscope_skeleton(${f})`);
}

// Line markers on fixtures
for (const f of fixtureFiles) {
  const content = readFileSync(join(ROOT, f), 'utf-8');
  const ext = getExt(f);
  const recipe = getRecipe(recipeForExt(ext));
  const filtered = applyRecipe(content, recipe);
  addMarkersAfterFilter(content, filtered, '//');
  track(`line_markers(${f})`);
}

// Expand on fixtures
for (const f of fixtureFiles) {
  const full = join(ROOT, f);
  const ext = getExt(f);

  // Try common function names
  const candidates = ['login', 'register', 'handle_request', 'handle_login', 'AuthService', 'APIHandler'];
  for (const fn of candidates) {
    expandFunction(full, `fn:${fn}`);
    track(`fullscope_expand(${f}, fn:${fn})`);
  }
}

// Verify line on fixtures
for (const f of fixtureFiles) {
  const full = join(ROOT, f);
  verifyLine(full, 1);
  verifyLine(full, 50);
  verifyLine(full, 130, 'async login');
  verifyLine(full, 999999); // OOB — should not crash or modify
  track(`fullscope_verify_line(${f}, x4)`);
}

// Search
runSearch('AuthService', ROOT, null, 10);
track('fullscope_search(AuthService)');
runSearch('login', ROOT, '*.js', 10);
track('fullscope_search(login, *.js)');
runSearch('$(echo injection)', ROOT, null, 5);
track('fullscope_search(injection attempt)');

// Usages
findUsages('estimateTokens', ROOT, 20);
track('fullscope_usages(estimateTokens)');
findUsages('applyRecipe', ROOT, 20);
track('fullscope_usages(applyRecipe)');

// Project
generateProjectOverview(ROOT);
track('fullscope_project()');

// Batch context with intent + budget
batchContext(
  fixtureFiles.map(f => ({ file_path: join(ROOT, f), priority: 'high' })),
  { intent: 'understand authentication flow', max_total_tokens: 2000 }
);
track('fullscope_batch_context(fixtures, intent + budget)');

console.log(`  ${operations.length} operations executed\n`);

// ─── Phase 3: Hash after ───

console.log('  Phase 3: verifying hashes...\n');

const results = [];
let allMatch = true;

for (const f of allFiles) {
  const after = hashFile(join(ROOT, f));
  const match = after === before[f];
  if (!match) allMatch = false;
  results.push({
    file: f,
    hash_before: before[f],
    hash_after: after,
    match,
  });
  const status = match ? 'OK' : 'CHANGED';
  console.log(`  ${before[f].slice(0, 12)}  ${status.padEnd(8)} ${f}`);
}

// ─── Phase 4: Write results ───

const dataDir = join(ROOT, 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const report = {
  timestamp: new Date().toISOString(),
  node_version: process.version,
  files_checked: allFiles.length,
  operations_run: operations.length,
  all_files_unchanged: allMatch,
  operations,
  file_results: results,
};

writeFileSync(join(dataDir, 'integrity-results.json'), JSON.stringify(report, null, 2));

console.log(`\n  Results written to data/integrity-results.json`);
console.log(`  ${allFiles.length} files checked, ${operations.length} operations run\n`);

if (allMatch) {
  console.log('  RESULT: ALL FILES UNCHANGED. Zero byte-level modifications.\n');
} else {
  console.log('  RESULT: *** INTEGRITY FAILURE — FILES WERE MODIFIED ***\n');
  process.exit(1);
}
