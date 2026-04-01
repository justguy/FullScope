#!/usr/bin/env node
/**
 * Task-level benchmark — proves that real tasks can be completed
 * with fewer tokens using fullscope vs raw reads.
 *
 * Run: node scripts/task-benchmark.js
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { applyRecipe, recipeForExt, getExt } from '../lib/recipes.js';
import { getRecipe } from '../lib/builtin-recipes.js';
import { skeletonize } from '../lib/skeleton.js';
import { expandFunction } from '../lib/expand.js';
import { verifyLine } from '../lib/verify.js';
import { estimateTokens } from '../lib/tokens.js';
import { generateProjectOverview } from '../lib/project.js';
import { findUsages } from '../lib/usages.js';

const ROOT = join(import.meta.dirname, '..');
const FIXTURE = join(ROOT, 'test/fixtures/auth-service.js');
const PY_FIXTURE = join(ROOT, 'test/fixtures/api-handler.py');

function tokens(text) { return estimateTokens(text); }

const tasks = [];

// ─── T1: Explain how login works ───

function taskExplainLogin() {
  const raw = readFileSync(FIXTURE, 'utf-8');
  const rawTokens = tokens(raw);

  const skeleton = skeletonize(raw, 'js');
  const skelTokens = tokens(skeleton);

  const expanded = expandFunction(FIXTURE, 'fn:login');
  const expandTokens = tokens(expanded);

  const fsTotal = skelTokens + expandTokens;
  const savings = Math.round((1 - fsTotal / rawTokens) * 100);

  // Verify: does the expanded output contain the login logic?
  const hasLoginLogic = expanded.includes('normalizedEmail') &&
    expanded.includes('Invalid credentials') &&
    expanded.includes('generateAccessToken');

  return {
    id: 'T1',
    task: 'Explain how login works',
    baseline_tokens: rawTokens,
    baseline_calls: 1,
    fs_tokens: fsTotal,
    fs_calls: 2,
    savings_pct: savings,
    result: hasLoginLogic ? 'pass' : 'fail',
    notes: `skeleton (${skelTokens}) + expand fn:login (${expandTokens})`,
  };
}

// ─── T2: Find where a symbol is used ───

function taskFindUsages() {
  // Baseline: would need to grep + read multiple files
  // Simulated baseline = reading 3 files that import estimateTokens
  const files = ['index.js', 'lib/batch.js', 'lib/expand.js'];
  let baselineTokens = 0;
  for (const f of files) {
    const p = join(ROOT, f);
    if (existsSync(p)) {
      baselineTokens += tokens(readFileSync(p, 'utf-8'));
    }
  }

  // fullscope flow: one fullscope_usages call
  const usageResult = findUsages('estimateTokens', ROOT, 20);
  const fsTokens = tokens(usageResult);

  const hasResults = usageResult.includes('estimateTokens') && usageResult.includes('files');
  const savings = Math.round((1 - fsTokens / baselineTokens) * 100);

  return {
    id: 'T2',
    task: 'Find where estimateTokens is used',
    baseline_tokens: baselineTokens,
    baseline_calls: files.length,
    fs_tokens: fsTokens,
    fs_calls: 1,
    savings_pct: savings,
    result: hasResults ? 'pass' : 'fail',
    notes: `fullscope_usages returns grouped results in ${fsTokens} tokens`,
  };
}

// ─── T3: Orient in a new repo ───

function taskOrientRepo() {
  // Baseline: tree + read package.json + read a few files
  let baselineTokens = 0;
  const baselineFiles = ['package.json', 'README.md'];
  for (const f of baselineFiles) {
    const p = join(ROOT, f);
    if (existsSync(p)) {
      baselineTokens += tokens(readFileSync(p, 'utf-8'));
    }
  }
  // Add estimated tree output
  baselineTokens += 200; // rough estimate for `ls -R` / tree output

  // fullscope flow: one fullscope_project call
  const projectResult = generateProjectOverview(ROOT);
  const fsTokens = tokens(projectResult);

  const hasStructure = projectResult.includes('Structure') && projectResult.includes('Entry Points');
  const savings = Math.round((1 - fsTokens / baselineTokens) * 100);

  return {
    id: 'T3',
    task: 'Orient in a new repo',
    baseline_tokens: baselineTokens,
    baseline_calls: baselineFiles.length + 1,
    fs_tokens: fsTokens,
    fs_calls: 1,
    savings_pct: savings,
    result: hasStructure ? 'pass' : 'fail',
    notes: `fullscope_project returns tree + configs + entry points in one call`,
  };
}

// ─── T4: Inspect implementation logic ───

function taskInspectLogic() {
  const raw = readFileSync(PY_FIXTURE, 'utf-8');
  const rawTokens = tokens(raw);

  const recipe = getRecipe(recipeForExt('py'));
  const filtered = applyRecipe(raw, recipe);
  const fsTokens = tokens(filtered);

  const hasLogic = filtered.includes('handle_request') &&
    filtered.includes('rate_limiter') &&
    filtered.includes('APIError');

  const savings = Math.round((1 - fsTokens / rawTokens) * 100);

  return {
    id: 'T4',
    task: 'Inspect Python API handler logic',
    baseline_tokens: rawTokens,
    baseline_calls: 1,
    fs_tokens: fsTokens,
    fs_calls: 1,
    savings_pct: savings,
    result: hasLogic ? 'pass' : 'fail',
    notes: `context compression strips docstrings and comments`,
  };
}

// ─── T5: Verify a line before editing ───

function taskVerifyLine() {
  const raw = readFileSync(FIXTURE, 'utf-8');
  const rawTokens = tokens(raw);

  // fullscope flow: verify_line returns ~11 lines of context
  const verifyResult = verifyLine(FIXTURE, 130, 'async login');
  const fsTokens = tokens(verifyResult);

  const confirmed = verifyResult.includes('confirmed');
  const savings = Math.round((1 - fsTokens / rawTokens) * 100);

  return {
    id: 'T5',
    task: 'Verify line 130 before editing',
    baseline_tokens: rawTokens,
    baseline_calls: 1,
    fs_tokens: fsTokens,
    fs_calls: 1,
    savings_pct: savings,
    result: confirmed ? 'pass' : 'fail',
    notes: `verify_line returns ±5 lines of context with match confirmation`,
  };
}

// ─── Run all tasks ───

console.log('\n  Task-level benchmark\n');

tasks.push(taskExplainLogin());
tasks.push(taskFindUsages());
tasks.push(taskOrientRepo());
tasks.push(taskInspectLogic());
tasks.push(taskVerifyLine());

for (const t of tasks) {
  const status = t.result === 'pass' ? 'PASS' : 'FAIL';
  console.log(`  ${t.id}: ${t.task}`);
  console.log(`     Baseline: ${t.baseline_tokens} tokens (${t.baseline_calls} calls)`);
  console.log(`     fullscope:  ${t.fs_tokens} tokens (${t.fs_calls} calls) → ${t.savings_pct}% saved`);
  console.log(`     Result:   ${status}`);
  console.log('');
}

// Summary table
console.log('  | Task | Baseline | fullscope | Savings | Result |');
console.log('  |------|----------|---------|---------|--------|');
for (const t of tasks) {
  console.log(`  | ${t.id} | ${t.baseline_tokens} tokens (${t.baseline_calls} calls) | ${t.fs_tokens} tokens (${t.fs_calls} calls) | ${t.savings_pct}% | ${t.result} |`);
}

// Write results
const dataDir = join(ROOT, 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, 'task-benchmark.json'), JSON.stringify(tasks, null, 2));
console.log(`\n  Results written to data/task-benchmark.json\n`);
