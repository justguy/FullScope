import { describe, it, expect, beforeEach } from 'vitest';
import {
  estimateTokens, savingsHeader, EDIT_SAFETY_FOOTER,
  trackRead, getSessionStats, resetSession,
} from '../lib/tokens.js';

describe('Token Estimation', () => {
  it('estimates tokens as ~0.75x word count', () => {
    const text = 'one two three four'; // 4 words
    expect(estimateTokens(text)).toBe(3); // ceil(4 * 0.75)
  });

  it('returns 0 for empty input', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });

  it('handles multi-line text', () => {
    const text = 'line one\nline two\nline three';
    expect(estimateTokens(text)).toBeGreaterThan(0);
  });
});

describe('Savings Header', () => {
  it('formats correctly', () => {
    const header = savingsHeader(1000, 400);
    expect(header).toContain('1,000');
    expect(header).toContain('400');
    expect(header).toContain('60%');
  });

  it('returns empty for zero raw tokens', () => {
    expect(savingsHeader(0, 0)).toBe('');
  });
});

describe('Edit Safety Footer', () => {
  it('contains warning text', () => {
    expect(EDIT_SAFETY_FOOTER).toContain('COMPRESSED VIEW');
    expect(EDIT_SAFETY_FOOTER).toContain('do not use these line numbers');
  });
});

describe('Session Tracking', () => {
  beforeEach(() => {
    resetSession();
  });

  it('tracks file reads', () => {
    trackRead('/foo/bar.ts', 'context', 1000, 600);
    trackRead('/foo/baz.ts', 'skeleton', 500, 50);
    const stats = getSessionStats();
    expect(stats).toContain('2 files');
    expect(stats).toContain('850'); // 400 + 450
  });

  it('detects context-rot (3+ reads)', () => {
    trackRead('/foo/bar.ts', 'skeleton', 100, 10);
    trackRead('/foo/bar.ts', 'context', 100, 60);
    trackRead('/foo/bar.ts', 'context', 100, 60);
    const stats = getSessionStats();
    expect(stats).toContain('Context-rot');
    expect(stats).toContain('bar.ts');
    expect(stats).toContain('3x');
  });

  it('includes cost estimate', () => {
    trackRead('/foo.ts', 'context', 1000000, 500000);
    const stats = getSessionStats();
    expect(stats).toContain('$');
  });
});
