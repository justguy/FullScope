#!/usr/bin/env node
/**
 * Benchmark script — runs fullscope compression against:
 *   1. Test fixtures (bundled representative code)
 *   2. External open-source projects (Express, FastAPI)
 *   3. Project's own source code
 *
 * Token counts use a lightweight word-count heuristic (~0.75 tokens/word).
 * These are estimates — relative savings remain accurate even if absolute
 * counts differ from a production tokenizer.
 *
 * Reproducible: node scripts/benchmark.js
 * Output: data/benchmarks.json + markdown table
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, basename, relative } from 'path';
import { applyRecipe, recipeForExt, getExt } from '../lib/recipes.js';
import { getRecipe } from '../lib/builtin-recipes.js';
import { skeletonize } from '../lib/skeleton.js';
import { estimateTokens } from '../lib/tokens.js';

const ROOT = join(import.meta.dirname, '..');
const DEV = join(ROOT, '..');

// ─── External project files (real open-source code, not ours) ───

const EXTERNAL = [
  // Express.js (JS, well-documented, real-world)
  { path: join(DEV, 'external-projects/express/lib/response.js'), language: 'JavaScript', source: 'express' },
  { path: join(DEV, 'external-projects/express/lib/application.js'), language: 'JavaScript', source: 'express' },
  { path: join(DEV, 'external-projects/express/lib/request.js'), language: 'JavaScript', source: 'express' },
  // FastAPI (Python, heavily documented)
  { path: join(DEV, 'external-projects/fastapi/fastapi/routing.py'), language: 'Python', source: 'FastAPI' },
  { path: join(DEV, 'external-projects/fastapi/fastapi/applications.py'), language: 'Python', source: 'FastAPI' },
  { path: join(DEV, 'external-projects/fastapi/fastapi/dependencies/utils.py'), language: 'Python', source: 'FastAPI' },
  // Python beginner projects (varied styles)
  { path: join(DEV, 'external-projects/python-beginner-projects/projects/goodreads-quotes-scraper/goodreadsScrape.py'), language: 'Python', source: 'python-projects' },
  { path: join(DEV, 'external-projects/python-beginner-projects/projects/Chess/main.py'), language: 'Python', source: 'python-projects' },
  { path: join(DEV, 'external-projects/python-beginner-projects/projects/Expense-Tracker/item.py'), language: 'Python', source: 'python-projects' },
  // Kubernetes (Go + YAML — large-scale production code)
  { path: join(DEV, 'external-projects/kubernetes/pkg/controller/controller_utils.go'), language: 'Go', source: 'Kubernetes' },
  { path: join(DEV, 'external-projects/kubernetes/pkg/controller/controller_ref_manager.go'), language: 'Go', source: 'Kubernetes' },
  { path: join(DEV, 'external-projects/kubernetes/cluster/addons/fluentd-gcp/fluentd-gcp-configmap.yaml'), language: 'YAML', source: 'Kubernetes' },
  // Ripgrep (Rust — heavily documented systems code)
  { path: join(DEV, 'external-projects/ripgrep/crates/core/flags/defs.rs'), language: 'Rust', source: 'Ripgrep' },
  { path: join(DEV, 'external-projects/ripgrep/crates/ignore/src/walk.rs'), language: 'Rust', source: 'Ripgrep' },
];

// ─── Bundled fixtures ───

const FIXTURES = [];
const fixtureDir = join(ROOT, 'test/fixtures');
if (existsSync(fixtureDir)) {
  const langMap = {
    js: 'JavaScript', ts: 'TypeScript', py: 'Python', rs: 'Rust',
    go: 'Go', java: 'Java', cs: 'C#', json: 'JSON', yml: 'YAML',
    toml: 'TOML', log: 'Log',
  };
  for (const f of readdirSync(fixtureDir)) {
    const ext = getExt(f);
    FIXTURES.push({
      path: join(fixtureDir, f),
      language: langMap[ext] || ext.toUpperCase(),
      source: 'fixture',
    });
  }
}

// ─── Benchmark function ───

function bench(filePath, language, source) {
  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const ext = getExt(filePath);
    const recipe = getRecipe(recipeForExt(ext));
    const contextFiltered = applyRecipe(raw, recipe);
    const skeleton = skeletonize(raw, ext);

    const rawTokens = estimateTokens(raw);
    const contextTokens = estimateTokens(contextFiltered);
    const skeletonTokens = estimateTokens(skeleton);
    const lines = raw.split('\n').length;

    return {
      file: basename(filePath),
      source,
      language,
      lines,
      raw_tokens: rawTokens,
      context_tokens: contextTokens,
      skeleton_tokens: skeletonTokens,
      context_pct: rawTokens > 0 ? Math.round((1 - contextTokens / rawTokens) * 1000) / 10 : 0,
      skeleton_pct: rawTokens > 0 ? Math.round((1 - skeletonTokens / rawTokens) * 1000) / 10 : 0,
    };
  } catch {
    return null;
  }
}

// ─── Run ───

console.log('\n  fullscope benchmark\n');

const externalResults = [];
const fixtureResults = [];

console.log('  External projects (not our code):');
for (const t of EXTERNAL) {
  const r = bench(t.path, t.language, t.source);
  if (r) {
    externalResults.push(r);
    console.log(`    ${r.file.padEnd(30)} ${String(r.lines).padStart(5)} lines  ctx: ${String(r.context_pct + '%').padStart(6)}  skel: ${String(r.skeleton_pct + '%').padStart(6)}  [${r.source}]`);
  }
}

console.log('\n  Bundled fixtures:');
for (const t of FIXTURES) {
  const r = bench(t.path, t.language, t.source);
  if (r) {
    fixtureResults.push(r);
    console.log(`    ${r.file.padEnd(30)} ${String(r.lines).padStart(5)} lines  ctx: ${String(r.context_pct + '%').padStart(6)}  skel: ${String(r.skeleton_pct + '%').padStart(6)}`);
  }
}

const allResults = [...externalResults, ...fixtureResults];

// Totals
function totals(results, label) {
  const totalRaw = results.reduce((s, r) => s + r.raw_tokens, 0);
  const totalCtx = results.reduce((s, r) => s + r.context_tokens, 0);
  const totalSkel = results.reduce((s, r) => s + r.skeleton_tokens, 0);
  const totalLines = results.reduce((s, r) => s + r.lines, 0);
  const ctxPct = ((1 - totalCtx / totalRaw) * 100).toFixed(1);
  const skelPct = ((1 - totalSkel / totalRaw) * 100).toFixed(1);
  console.log(`\n  ${label}: ${results.length} files, ${totalLines} lines, context: ${ctxPct}%, skeleton: ${skelPct}%`);
  return { totalRaw, totalCtx, totalSkel, totalLines, ctxPct, skelPct };
}

const extTotals = totals(externalResults, 'External');
const fixTotals = totals(fixtureResults, 'Fixtures');
const allTotals = totals(allResults, 'Combined');

// Session savings estimate
const sessionFiles = 30;
const avgRaw = allTotals.totalRaw / allResults.length;
const avgCtx = allTotals.totalCtx / allResults.length;
const sessionSaved = Math.round((avgRaw - avgCtx) * sessionFiles);
const costSaved = (sessionSaved / 1_000_000 * 15).toFixed(2);
console.log(`\n  Estimated 30-file session: ~${sessionSaved.toLocaleString()} tokens saved (~$${costSaved} at $15/1M)`);

// Write JSON
const dataDir = join(ROOT, 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, 'benchmarks.json'), JSON.stringify({
  generated: new Date().toISOString(),
  note: 'Token counts are estimates (~0.75 tokens/word). Relative savings are accurate.',
  external: externalResults,
  fixtures: fixtureResults,
  summary: {
    external: extTotals,
    fixtures: fixTotals,
    combined: allTotals,
    session_estimate: { files: sessionFiles, tokens_saved: sessionSaved, cost_saved_usd: costSaved },
  },
}, null, 2));

// Markdown tables
console.log('\n\n  ## External Projects (not our code)\n');
console.log('  | File | Source | Lang | Lines | Raw | Context % | Skeleton % |');
console.log('  |------|--------|------|------:|----:|----------:|-----------:|');
for (const r of externalResults) {
  console.log(`  | ${r.file} | ${r.source} | ${r.language} | ${r.lines} | ${r.raw_tokens} | ${r.context_pct}% | ${r.skeleton_pct}% |`);
}

console.log('\n  ## Bundled Fixtures\n');
console.log('  | File | Lang | Lines | Raw | Context % | Skeleton % |');
console.log('  |------|------|------:|----:|----------:|-----------:|');
for (const r of fixtureResults) {
  console.log(`  | ${r.file} | ${r.language} | ${r.lines} | ${r.raw_tokens} | ${r.context_pct}% | ${r.skeleton_pct}% |`);
}
console.log('');
