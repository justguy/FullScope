import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { checkDiffCache, updateDiffCache, clearDiffCache, getDiffCacheSize } from '../lib/diff-cache.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const TMP_DIR = join(import.meta.dirname, '.tmp-diff');

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

beforeEach(() => {
  clearDiffCache();
});

function writeTmp(name, content) {
  const p = join(TMP_DIR, name);
  writeFileSync(p, content);
  return p;
}

describe('Diff Cache', () => {
  it('returns null on first read (no cache)', () => {
    const path = writeTmp('first.js', 'const x = 1;');
    expect(checkDiffCache(path)).toBeNull();
  });

  it('returns unchanged on re-read of same file', () => {
    const path = writeTmp('unchanged.js', 'const x = 1;');
    const content = 'const x = 1;';
    updateDiffCache(path, content);

    const result = checkDiffCache(path);
    expect(result).not.toBeNull();
    expect(result.type).toBe('unchanged');
    expect(result.message).toContain('unchanged');
  });

  it('returns diff on small change', () => {
    const path = writeTmp('small-change.js', 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10');
    updateDiffCache(path, 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10');

    // Make a small change
    writeFileSync(path, 'line1\nline2\nCHANGED\nline4\nline5\nline6\nline7\nline8\nline9\nline10');

    const result = checkDiffCache(path);
    expect(result).not.toBeNull();
    expect(result.type).toBe('diff');
    expect(result.message).toContain('CHANGED');
    expect(result.message).toContain('lines changed');
  });

  it('returns null on large change (>30%)', () => {
    const original = Array(10).fill('original line').join('\n');
    const path = writeTmp('big-change.js', original);
    updateDiffCache(path, original);

    // Change more than 30%
    const changed = Array(10).fill('completely different').join('\n');
    writeFileSync(path, changed);

    const result = checkDiffCache(path);
    expect(result).toBeNull(); // should trigger full re-read
  });

  it('tracks cache size', () => {
    expect(getDiffCacheSize()).toBe(0);
    updateDiffCache(writeTmp('a.js', 'a'), 'a');
    expect(getDiffCacheSize()).toBe(1);
    updateDiffCache(writeTmp('b.js', 'b'), 'b');
    expect(getDiffCacheSize()).toBe(2);
  });

  it('clears cache', () => {
    updateDiffCache(writeTmp('c.js', 'c'), 'c');
    expect(getDiffCacheSize()).toBe(1);
    clearDiffCache();
    expect(getDiffCacheSize()).toBe(0);
  });

  it('handles missing file gracefully', () => {
    updateDiffCache('/nonexistent/file.js', 'content');
    // Should not throw, just not cache (no stat)
    expect(getDiffCacheSize()).toBe(0);
  });
});
