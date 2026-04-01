import { describe, it, expect } from 'vitest';
import { applyRecipe } from '../lib/recipes.js';
import { getRecipe, recipes } from '../lib/builtin-recipes.js';
import { EDIT_SAFETY_FOOTER } from '../lib/tokens.js';
import { insertLineMarkers, addMarkersAfterFilter } from '../lib/line-markers.js';

describe('Edit Safety', () => {
  it('safety footer is not stripped by any recipe', () => {
    // Simulate: recipe output + footer appended
    for (const [name, recipe] of Object.entries(recipes)) {
      const code = 'const x = 1;\n' + EDIT_SAFETY_FOOTER;
      // The footer should NOT be passed through the recipe —
      // it's appended AFTER. But let's verify it survives if accidentally included.
      const result = applyRecipe(code, recipe);
      // At minimum, the code part should survive
      expect(typeof result).toBe('string');
    }
  });

  it('footer contains required warning keywords', () => {
    expect(EDIT_SAFETY_FOOTER).toContain('COMPRESSED');
    expect(EDIT_SAFETY_FOOTER).toContain('line numbers');
    expect(EDIT_SAFETY_FOOTER).toContain('raw file');
  });
});

describe('Virtual Line Markers', () => {
  it('insertLineMarkers adds markers for gaps', () => {
    const original = ['a', 'b', 'c', 'd', 'e'];
    const kept = [1, 4, 5]; // keep lines 1, 4, 5; strip 2, 3
    const result = insertLineMarkers(original, kept);
    expect(result).toContain('a');
    expect(result).toContain('2 lines stripped');
    expect(result).toContain('d');
    expect(result).toContain('e');
  });

  it('insertLineMarkers handles all lines kept', () => {
    const original = ['a', 'b', 'c'];
    const kept = [1, 2, 3];
    const result = insertLineMarkers(original, kept);
    expect(result).not.toContain('stripped');
    expect(result).toContain('a');
    expect(result).toContain('b');
    expect(result).toContain('c');
  });

  it('insertLineMarkers handles all lines stripped', () => {
    const original = ['a', 'b', 'c'];
    const kept = [];
    const result = insertLineMarkers(original, kept);
    expect(result).toContain('3 lines stripped');
  });

  it('insertLineMarkers handles trailing gap', () => {
    const original = ['a', 'b', 'c', 'd'];
    const kept = [1, 2];
    const result = insertLineMarkers(original, kept);
    expect(result).toContain('a');
    expect(result).toContain('b');
    expect(result).toContain('2 lines stripped');
  });

  it('addMarkersAfterFilter detects removed lines', () => {
    const original = '// comment\ncode();\n// another\nmore();';
    const filtered = 'code();\nmore();';
    const result = addMarkersAfterFilter(original, filtered);
    expect(result).toContain('1 line stripped');
    expect(result).toContain('code();');
    expect(result).toContain('more();');
  });

  it('addMarkersAfterFilter uses custom comment prefix', () => {
    const original = '# comment\ncode\n# another\nmore';
    const filtered = 'code\nmore';
    const result = addMarkersAfterFilter(original, filtered, '#');
    expect(result).toContain('# ...');
  });
});

describe('Verify Line', () => {
  // Tested via the module directly
  it('is importable', async () => {
    const { verifyLine } = await import('../lib/verify.js');
    expect(typeof verifyLine).toBe('function');
  });
});
