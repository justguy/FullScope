import { describe, it, expect } from 'vitest';
import { compressJSON } from '../lib/json-compress.js';

describe('JSON Compression', () => {
  describe('compact mode', () => {
    it('passes through small objects', () => {
      const input = JSON.stringify({ name: 'foo', version: '1.0' }, null, 2);
      const result = compressJSON(input, 'compact');
      const parsed = JSON.parse(result);
      expect(parsed.name).toBe('foo');
      expect(parsed.version).toBe('1.0');
    });

    it('truncates large arrays to 3 items + count', () => {
      const input = JSON.stringify({ items: Array(20).fill({ id: 1, name: 'test' }) }, null, 2);
      const result = compressJSON(input, 'compact');
      const parsed = JSON.parse(result);
      expect(parsed.items).toHaveLength(4); // 3 items + count string
      expect(parsed.items[3]).toContain('17 more items');
      expect(parsed.items[3]).toContain('20 total');
    });

    it('preserves small arrays', () => {
      const input = JSON.stringify({ tags: ['a', 'b', 'c'] }, null, 2);
      const result = compressJSON(input, 'compact');
      const parsed = JSON.parse(result);
      expect(parsed.tags).toEqual(['a', 'b', 'c']);
    });

    it('truncates long strings', () => {
      const longStr = 'x'.repeat(300);
      const input = JSON.stringify({ data: longStr });
      const result = compressJSON(input, 'compact');
      const parsed = JSON.parse(result);
      expect(parsed.data.length).toBeLessThan(200);
      expect(parsed.data).toContain('300 chars');
    });

    it('handles nested structures', () => {
      const input = JSON.stringify({
        a: { b: { c: { d: 'deep' } } },
      }, null, 2);
      const result = compressJSON(input, 'compact');
      const parsed = JSON.parse(result);
      expect(parsed.a.b.c.d).toBe('deep');
    });
  });

  describe('schema mode', () => {
    it('extracts types from object', () => {
      const input = JSON.stringify({ name: 'foo', count: 42, active: true });
      const result = compressJSON(input, 'schema');
      const parsed = JSON.parse(result);
      expect(parsed.name).toBe('<string>');
      expect(parsed.count).toBe('<number>');
      expect(parsed.active).toBe('<boolean>');
    });

    it('shows array length and element schema', () => {
      const input = JSON.stringify({ items: [{ id: 1, name: 'test' }] });
      const result = compressJSON(input, 'schema');
      const parsed = JSON.parse(result);
      expect(Object.keys(parsed.items)[0]).toContain('array[1]');
    });

    it('handles empty arrays', () => {
      const input = JSON.stringify({ items: [] });
      const result = compressJSON(input, 'schema');
      expect(result).toContain('array[0]');
    });

    it('handles null values', () => {
      const input = JSON.stringify({ value: null });
      const result = compressJSON(input, 'schema');
      expect(result).toContain('<null>');
    });
  });

  it('returns invalid JSON unchanged', () => {
    const input = 'not { valid json';
    expect(compressJSON(input)).toBe(input);
  });
});
