import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { applyRecipe, recipeForExt, getExt } from '../lib/recipes.js';
import { getRecipe } from '../lib/builtin-recipes.js';
import { skeletonize } from '../lib/skeleton.js';
import { expandFunction } from '../lib/expand.js';
import { verifyLine } from '../lib/verify.js';
import { estimateTokens } from '../lib/tokens.js';
import { addMarkersAfterFilter } from '../lib/line-markers.js';
import { findUsages } from '../lib/usages.js';

const FIXTURE = join(import.meta.dirname, 'fixtures/auth-service.js');
const PY_FIXTURE = join(import.meta.dirname, 'fixtures/api-handler.py');

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('File Integrity', () => {
  it('source file is unchanged after fullscope_context operations', () => {
    const before = hashFile(FIXTURE);

    // Simulate fullscope_context
    const raw = readFileSync(FIXTURE, 'utf-8');
    const ext = getExt(FIXTURE);
    const recipe = getRecipe(recipeForExt(ext));
    applyRecipe(raw, recipe);

    const after = hashFile(FIXTURE);
    expect(after).toBe(before);
  });

  it('source file is unchanged after fullscope_skeleton', () => {
    const before = hashFile(FIXTURE);

    const raw = readFileSync(FIXTURE, 'utf-8');
    skeletonize(raw, getExt(FIXTURE));

    const after = hashFile(FIXTURE);
    expect(after).toBe(before);
  });

  it('source file is unchanged after fullscope_expand', () => {
    const before = hashFile(FIXTURE);

    expandFunction(FIXTURE, 'fn:login');

    const after = hashFile(FIXTURE);
    expect(after).toBe(before);
  });

  it('source file is unchanged after fullscope_verify_line', () => {
    const before = hashFile(FIXTURE);

    verifyLine(FIXTURE, 1);
    verifyLine(FIXTURE, 50);
    verifyLine(FIXTURE, 100, 'some expected content');

    const after = hashFile(FIXTURE);
    expect(after).toBe(before);
  });

  it('source file is unchanged after all operations combined', () => {
    const before = hashFile(FIXTURE);

    // Run every read operation against the same file
    const raw = readFileSync(FIXTURE, 'utf-8');
    const ext = getExt(FIXTURE);
    const recipe = getRecipe(recipeForExt(ext));

    applyRecipe(raw, recipe);
    skeletonize(raw, ext);
    expandFunction(FIXTURE, 'fn:login');
    expandFunction(FIXTURE, 'fn:register');
    verifyLine(FIXTURE, 1);
    verifyLine(FIXTURE, 130, 'async login');
    addMarkersAfterFilter(raw, applyRecipe(raw, recipe), '//');

    const after = hashFile(FIXTURE);
    expect(after).toBe(before);
  });

  it('Python fixture is unchanged after all operations', () => {
    const before = hashFile(PY_FIXTURE);

    const raw = readFileSync(PY_FIXTURE, 'utf-8');
    const ext = getExt(PY_FIXTURE);
    const recipe = getRecipe(recipeForExt(ext));

    applyRecipe(raw, recipe);
    skeletonize(raw, ext);
    expandFunction(PY_FIXTURE, 'fn:handle_request');
    verifyLine(PY_FIXTURE, 1);

    const after = hashFile(PY_FIXTURE);
    expect(after).toBe(before);
  });
});

describe('Line Mapping Accuracy', () => {
  it('compressed output preserves original line numbers', () => {
    const raw = readFileSync(FIXTURE, 'utf-8');
    const ext = getExt(FIXTURE);
    const recipe = getRecipe(recipeForExt(ext));
    const filtered = applyRecipe(raw, recipe);
    const withMarkers = addMarkersAfterFilter(raw, filtered, '//');

    // Lines that survive compression should match their original content
    const rawLines = raw.split('\n');
    const markedLines = withMarkers.split('\n');

    for (const line of markedLines) {
      if (line.includes('stripped]')) continue; // skip markers
      // Find this line in original
      const trimmed = line.trim();
      if (trimmed === '') continue;
      const found = rawLines.some(rl => rl.trim() === trimmed);
      expect(found, `Line "${trimmed.slice(0, 60)}" not found in original`).toBe(true);
    }
  });

  it('verify_line confirms content at known positions', () => {
    const raw = readFileSync(FIXTURE, 'utf-8');
    const lines = raw.split('\n');

    // Verify specific known lines
    const line1 = lines[0]; // shebang or first line
    const result1 = verifyLine(FIXTURE, 1, line1.trim());
    expect(result1).toContain('confirmed');

    // Verify a line deep in the file
    const line130 = lines[129];
    const result130 = verifyLine(FIXTURE, 130, line130.trim());
    expect(result130).toContain('confirmed');
  });

  it('verify_line detects mismatches', () => {
    const result = verifyLine(FIXTURE, 1, 'THIS CONTENT DOES NOT EXIST');
    expect(result).toContain('Mismatch');
  });

  it('expand returns lines from the correct range', () => {
    const raw = readFileSync(FIXTURE, 'utf-8');
    const rawLines = raw.split('\n');

    const expanded = expandFunction(FIXTURE, 'fn:login');
    // The expanded output should contain the actual login function content
    expect(expanded).toContain('async login');
    expect(expanded).toContain('normalizedEmail');
    expect(expanded).toContain('Invalid credentials');

    // Line numbers in expand output should match raw file
    const lineMatch = expanded.match(/lines (\d+)-(\d+)/);
    if (lineMatch) {
      const startLine = parseInt(lineMatch[1]);
      const endLine = parseInt(lineMatch[2]);
      // The raw file at startLine should contain 'login'
      expect(rawLines[startLine - 1]).toContain('login');
    }
  });
});

describe('Failure Safety', () => {
  it('returns raw content when recipe fails on malformed input', () => {
    const malformed = '\x00\x01\x02 normal text \x03\x04';
    const result = applyRecipe(malformed, getRecipe('code-generic'));
    // Should return something (not crash)
    expect(typeof result).toBe('string');
  });

  it('expand returns readable error for missing function', () => {
    const result = expandFunction(FIXTURE, 'fn:nonexistentFunction');
    expect(result).toContain('not found');
  });

  it('expand returns readable error for bad handle format', () => {
    const result = expandFunction(FIXTURE, 'garbage');
    expect(result).toContain('Invalid handle');
  });

  it('verify_line returns readable error for out-of-range line', () => {
    const result = verifyLine(FIXTURE, 999999);
    expect(result).toContain('out of range');
  });

  it('verify_line returns readable error for missing file', () => {
    const result = verifyLine('/nonexistent/path/file.js', 1);
    expect(result).toContain('Error');
  });

  it('skeleton returns empty string for empty input', () => {
    const result = skeletonize('', 'js');
    expect(result).toBe('');
  });

  it('unknown file extension falls back to generic recipe', () => {
    const recipe = getRecipe(recipeForExt('xyz'));
    expect(recipe).toBeDefined();
    const result = applyRecipe('// comment\nreal code', recipe);
    expect(result).toContain('real code');
  });
});
