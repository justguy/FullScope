import { describe, it, expect } from 'vitest';
import { deduplicateLines } from '../lib/line-dedup.js';

describe('Line Deduplication', () => {
  it('collapses 3+ consecutive identical lines', () => {
    const input = 'line1\nrepeated\nrepeated\nrepeated\nrepeated\nline2';
    const result = deduplicateLines(input);
    expect(result).toContain('repeated');
    expect(result).toContain('[repeated 3x]');
    expect(result).toContain('line2');
    // Should not have all 4 copies
    expect(result.split('repeated').length).toBeLessThan(5);
  });

  it('does not collapse fewer than threshold lines', () => {
    const input = 'a\nb\nb\nc';
    const result = deduplicateLines(input);
    expect(result).toBe('a\nb\nb\nc');
  });

  it('collapses lines differing only in numbers', () => {
    const input = [
      'Processing item 1',
      'Processing item 2',
      'Processing item 3',
      'Processing item 4',
      'Done',
    ].join('\n');
    const result = deduplicateLines(input);
    expect(result).toContain('Processing item 1');
    expect(result).toContain('[repeated 3x]');
    expect(result).toContain('Done');
  });

  it('collapses lines differing only in timestamps', () => {
    const input = [
      '2024-01-15T10:00:01 INFO Starting',
      '2024-01-15T10:00:02 INFO Starting',
      '2024-01-15T10:00:03 INFO Starting',
      '2024-01-15T10:00:04 INFO Starting',
      'Done',
    ].join('\n');
    const result = deduplicateLines(input);
    expect(result).toContain('[repeated 3x]');
  });

  it('handles empty input', () => {
    expect(deduplicateLines('')).toBe('');
    expect(deduplicateLines(null)).toBeNull();
  });

  it('handles input shorter than threshold', () => {
    expect(deduplicateLines('a\nb')).toBe('a\nb');
  });

  it('supports custom threshold', () => {
    const input = 'a\nb\nb\nb\nc';
    // Default threshold 3 should collapse
    expect(deduplicateLines(input, 3)).toContain('[repeated');
    // Higher threshold should not
    expect(deduplicateLines(input, 5)).not.toContain('[repeated');
  });

  it('handles multiple groups of duplicates', () => {
    const input = [
      'group1', 'group1', 'group1',
      'separator',
      'group2', 'group2', 'group2',
    ].join('\n');
    const result = deduplicateLines(input);
    const matches = result.match(/\[repeated/g);
    expect(matches).toHaveLength(2);
  });
});
