import { describe, it, expect } from 'vitest';
import { adaptRecipe } from '../lib/recipes.js';

describe('Adaptive Compression Tiers', () => {
  const fullRecipe = {
    strip_ansi: true,
    remove_lines: ['^\\s*\\/\\/'],
    multiline_replace: [['\\/\\*[\\s\\S]*?\\*\\/', '']],
    replace: [['\\s*\\/\\/.*$', '']],
    remove_blank_lines: true,
    on_empty: '// [empty]',
  };

  it('light compression for < 50 lines', () => {
    const result = adaptRecipe(fullRecipe, 30);
    // Should only have strip_ansi and remove_blank_lines
    expect(result.strip_ansi).toBe(true);
    expect(result.remove_blank_lines).toBe(true);
    // Should NOT have aggressive patterns
    expect(result.remove_lines).toBeUndefined();
    expect(result.multiline_replace).toBeUndefined();
    expect(result.replace).toBeUndefined();
  });

  it('normal compression for 50-500 lines', () => {
    const result = adaptRecipe(fullRecipe, 200);
    // Should be identical to input recipe
    expect(result).toEqual(fullRecipe);
  });

  it('aggressive compression for > 500 lines', () => {
    const result = adaptRecipe(fullRecipe, 1000);
    // Should have max_lines and lines_from added
    expect(result.max_lines).toBe(400);
    expect(result.lines_from).toBe('both');
    // Should preserve original patterns
    expect(result.remove_lines).toEqual(fullRecipe.remove_lines);
  });

  it('does not override existing max_lines', () => {
    const recipeWithMax = { ...fullRecipe, max_lines: 100 };
    const result = adaptRecipe(recipeWithMax, 1000);
    expect(result.max_lines).toBe(100); // keeps existing
  });

  it('handles null recipe', () => {
    expect(adaptRecipe(null, 100)).toBeNull();
  });

  it('handles zero lines', () => {
    expect(adaptRecipe(fullRecipe, 0)).toBe(fullRecipe);
  });
});
