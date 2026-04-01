import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { applyRecipe, recipeForExt, getExt } from '../lib/recipes.js';
import { getRecipe } from '../lib/builtin-recipes.js';
import { skeletonize } from '../lib/skeleton.js';
import { estimateTokens } from '../lib/tokens.js';

const DEV = join(import.meta.dirname, '..', '..');

function processFile(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const ext = getExt(filePath);
  const recipe = getRecipe(recipeForExt(ext));
  const context = applyRecipe(raw, recipe);
  const skeleton = skeletonize(raw, ext);
  return {
    rawTokens: estimateTokens(raw),
    contextTokens: estimateTokens(context),
    skeletonTokens: estimateTokens(skeleton),
  };
}

describe('Savings Thresholds on Real Files', () => {
  const targets = [
    { path: join(import.meta.dirname, '../lib/skeleton.js'), name: 'skeleton.js (JS)' },
    { path: join(import.meta.dirname, '../lib/project.js'), name: 'project.js (JS)' },
    { path: join(import.meta.dirname, 'fixtures/auth-service.js'), name: 'auth-service.js (JS)' },
    { path: join(import.meta.dirname, 'fixtures/api-handler.py'), name: 'api-handler.py (Python)' },
    { path: join(import.meta.dirname, 'fixtures/registry.rs'), name: 'registry.rs (Rust)' },
    { path: join(import.meta.dirname, 'fixtures/server.ts'), name: 'server.ts (TypeScript)' },
    { path: join(import.meta.dirname, 'fixtures/http-handler.go'), name: 'http-handler.go (Go)' },
    { path: join(import.meta.dirname, 'fixtures/AuthController.java'), name: 'AuthController.java (Java)' },
    { path: join(import.meta.dirname, 'fixtures/AuthController.cs'), name: 'AuthController.cs (C#)' },
    { path: join(import.meta.dirname, 'fixtures/server.log'), name: 'server.log (Log)' },
  ];

  for (const { path, name } of targets) {
    if (!existsSync(path)) continue;

    it(`${name}: compression does not expand content`, () => {
      const { rawTokens, contextTokens, skeletonTokens } = processFile(path);
      // Context should not be larger than raw
      expect(contextTokens, `context for ${name}`).toBeLessThanOrEqual(rawTokens);
      // Skeleton should not be larger than raw
      expect(skeletonTokens, `skeleton for ${name}`).toBeLessThanOrEqual(rawTokens);
    });
  }

  it('skeleton never returns more tokens than raw', () => {
    for (const { path } of targets) {
      if (!existsSync(path)) continue;
      const { rawTokens, skeletonTokens } = processFile(path);
      expect(skeletonTokens).toBeLessThanOrEqual(rawTokens);
    }
  });

  it('context never returns more tokens than raw', () => {
    for (const { path } of targets) {
      if (!existsSync(path)) continue;
      const { rawTokens, contextTokens } = processFile(path);
      expect(contextTokens).toBeLessThanOrEqual(rawTokens);
    }
  });
});
