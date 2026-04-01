import { describe, it, expect, beforeEach } from 'vitest';
import { compactPath, compactPaths, setProjectRoot, getProjectRoot } from '../lib/path-compact.js';

describe('Path Compaction', () => {
  beforeEach(() => {
    setProjectRoot('/Users/dev/myproject');
  });

  it('strips project root from absolute path', () => {
    expect(compactPath('/Users/dev/myproject/src/main.rs')).toBe('src/main.rs');
  });

  it('leaves paths outside project root unchanged', () => {
    expect(compactPath('/other/path/file.js')).toBe('/other/path/file.js');
  });

  it('handles null/undefined input', () => {
    expect(compactPath(null)).toBeNull();
    expect(compactPath(undefined)).toBeUndefined();
  });

  it('handles root with trailing slash', () => {
    setProjectRoot('/Users/dev/myproject/');
    expect(compactPath('/Users/dev/myproject/src/main.rs')).toBe('src/main.rs');
  });

  it('compactPaths replaces all occurrences in text', () => {
    const text = 'Error in /Users/dev/myproject/src/foo.js and /Users/dev/myproject/src/bar.js';
    const result = compactPaths(text);
    expect(result).toBe('Error in src/foo.js and src/bar.js');
  });

  it('compactPaths with custom root', () => {
    const text = '/custom/root/file.js';
    const result = compactPaths(text, '/custom/root');
    expect(result).toBe('file.js');
  });

  it('getProjectRoot defaults to cwd', () => {
    setProjectRoot(null);
    expect(getProjectRoot()).toBe(process.cwd());
  });
});
