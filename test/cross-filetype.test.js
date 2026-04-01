import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { applyRecipe, recipeForExt, getExt, adaptRecipe } from '../lib/recipes.js';
import { getRecipe } from '../lib/builtin-recipes.js';
import { skeletonize } from '../lib/skeleton.js';
import { expandFunction } from '../lib/expand.js';
import { verifyLine } from '../lib/verify.js';
import { estimateTokens } from '../lib/tokens.js';
import { addMarkersAfterFilter } from '../lib/line-markers.js';
import { compressJSON } from '../lib/json-compress.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');
const allFixtures = readdirSync(FIXTURES_DIR).map(f => ({
  name: f,
  path: join(FIXTURES_DIR, f),
  ext: getExt(f),
}));

const CODE_EXTS = new Set(['js', 'ts', 'py', 'rs', 'go', 'java', 'cs', 'cpp']);
const codeFixtures = allFixtures.filter(f => CODE_EXTS.has(f.ext));
const allFixtureFiles = allFixtures;

function hashContent(content) {
  return createHash('sha256').update(content).digest('hex');
}

// ─── 1. Every fixture gets a recipe and doesn't crash ───

describe('Cross-filetype: context compression', () => {
  for (const f of allFixtureFiles) {
    it(`${f.name}: compresses without crashing`, () => {
      const raw = readFileSync(f.path, 'utf-8');
      const recipeName = recipeForExt(f.ext);
      const recipe = getRecipe(recipeName);
      expect(recipe).toBeDefined();

      const result = applyRecipe(raw, recipe);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it(`${f.name}: saves tokens (or at least doesn't expand)`, () => {
      const raw = readFileSync(f.path, 'utf-8');
      const recipe = getRecipe(recipeForExt(f.ext));
      const filtered = applyRecipe(raw, recipe);
      const rawTokens = estimateTokens(raw);
      const filteredTokens = estimateTokens(filtered);
      // Filtered should not be larger than raw
      expect(filteredTokens).toBeLessThanOrEqual(rawTokens * 1.05); // 5% tolerance for markers
    });
  }
});

// ─── 2. Code fixtures: skeleton ───

describe('Cross-filetype: skeleton', () => {
  for (const f of codeFixtures) {
    it(`${f.name}: skeletonizes without crashing`, () => {
      const raw = readFileSync(f.path, 'utf-8');
      const result = skeletonize(raw, f.ext);
      expect(typeof result).toBe('string');
    });

    it(`${f.name}: skeleton is smaller than raw`, () => {
      const raw = readFileSync(f.path, 'utf-8');
      const skeleton = skeletonize(raw, f.ext);
      const rawTokens = estimateTokens(raw);
      const skelTokens = estimateTokens(skeleton);
      // Skeleton should not be larger than raw
      expect(skelTokens).toBeLessThanOrEqual(rawTokens);
    });
  }
});

// ─── 3. Code fixtures: expand ───

describe('Cross-filetype: expand', () => {
  const expandTargets = {
    'auth-service.js': 'login',
    'server.ts': 'AppServer',
    'api-handler.py': 'handle_request',
    'registry.rs': 'filter',
    'http-handler.go': 'NewHandler',
    'AuthController.java': 'login',
    'AuthController.cs': 'Login',
  };

  for (const [file, fn] of Object.entries(expandTargets)) {
    const f = allFixtures.find(x => x.name === file);
    if (!f) continue;

    it(`${file}: expands fn:${fn} without crashing`, () => {
      const result = expandFunction(f.path, `fn:${fn}`);
      expect(typeof result).toBe('string');
      // Should either find the function or return a readable error
      expect(result.length).toBeGreaterThan(0);
    });
  }
});

// ─── 4. All fixtures: verify_line ───

describe('Cross-filetype: verify_line', () => {
  for (const f of allFixtureFiles) {
    it(`${f.name}: verify_line at line 1 works`, () => {
      const result = verifyLine(f.path, 1);
      expect(result).toContain('Raw file:');
    });
  }
});

// ─── 5. All fixtures: file integrity ───

describe('Cross-filetype: file integrity', () => {
  it('all fixtures unchanged after all operations', () => {
    const beforeHashes = {};
    for (const f of allFixtureFiles) {
      beforeHashes[f.name] = hashContent(readFileSync(f.path));
    }

    // Run every operation on every fixture
    for (const f of allFixtureFiles) {
      const raw = readFileSync(f.path, 'utf-8');
      const recipe = getRecipe(recipeForExt(f.ext));
      applyRecipe(raw, recipe);
      if (CODE_EXTS.has(f.ext)) {
        skeletonize(raw, f.ext);
      }
      verifyLine(f.path, 1);
    }

    // Verify hashes
    for (const f of allFixtureFiles) {
      const after = hashContent(readFileSync(f.path));
      expect(after, `${f.name} was modified`).toBe(beforeHashes[f.name]);
    }
  });
});

// ─── 6. Line markers ───

describe('Cross-filetype: line markers', () => {
  for (const f of codeFixtures) {
    it(`${f.name}: markers inserted when lines are stripped`, () => {
      const raw = readFileSync(f.path, 'utf-8');
      const recipe = getRecipe(recipeForExt(f.ext));
      const filtered = applyRecipe(raw, recipe);

      if (filtered.length < raw.length) {
        const withMarkers = addMarkersAfterFilter(raw, filtered, '//');
        expect(withMarkers).toContain('stripped]');
      }
    });
  }
});

// ─── 7. Adaptive compression ───

describe('Cross-filetype: adaptive compression', () => {
  it('small file (<50 lines) gets light compression', () => {
    const f = allFixtures.find(x => x.name === 'small-config.toml');
    if (!f) return;
    const raw = readFileSync(f.path, 'utf-8');
    const lines = raw.split('\n').length;
    expect(lines).toBeLessThan(50);

    const recipe = getRecipe(recipeForExt(f.ext));
    const adapted = adaptRecipe(recipe, lines);
    // Light: should not have remove_lines
    expect(adapted.remove_lines).toBeUndefined();
  });

  it('large file (>500 lines) gets aggressive compression', () => {
    // Find a large fixture or use auth-service (449 lines — close enough, test the logic)
    const recipe = getRecipe('code-js');
    const adapted = adaptRecipe(recipe, 800);
    expect(adapted.max_lines).toBeDefined();
  });
});

// ─── 8. JSON modes ───

describe('Cross-filetype: JSON compression', () => {
  const jsonFixture = allFixtures.find(x => x.name === 'api-response.json');

  it('compact mode truncates arrays', () => {
    if (!jsonFixture) return;
    const raw = readFileSync(jsonFixture.path, 'utf-8');
    const result = compressJSON(raw, 'compact');
    const parsed = JSON.parse(result);
    // The data array has 8 items, should be truncated to 4 (3 + count)
    expect(parsed.data.length).toBeLessThan(8);
  });

  it('schema mode extracts types', () => {
    if (!jsonFixture) return;
    const raw = readFileSync(jsonFixture.path, 'utf-8');
    const result = compressJSON(raw, 'schema');
    expect(result).toContain('<string>');
    expect(result).toContain('<number>');
  });

  it('broken JSON returns raw content', () => {
    const broken = allFixtures.find(x => x.name === 'broken.json');
    if (!broken) return;
    const raw = readFileSync(broken.path, 'utf-8');
    const result = compressJSON(raw, 'compact');
    expect(result).toBe(raw); // returned unchanged
  });
});

// ─── 9. Fail-safe on broken files ───

describe('Cross-filetype: fail-safe', () => {
  it('broken.json: context compression does not crash', () => {
    const f = allFixtures.find(x => x.name === 'broken.json');
    if (!f) return;
    const raw = readFileSync(f.path, 'utf-8');
    const result = applyRecipe(raw, getRecipe(recipeForExt('json')));
    expect(typeof result).toBe('string');
  });

  it('broken.yml: context compression does not crash', () => {
    const f = allFixtures.find(x => x.name === 'broken.yml');
    if (!f) return;
    const raw = readFileSync(f.path, 'utf-8');
    const result = applyRecipe(raw, getRecipe(recipeForExt('yml')));
    expect(typeof result).toBe('string');
  });
});
