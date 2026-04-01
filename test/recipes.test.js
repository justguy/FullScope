import { describe, it, expect } from 'vitest';
import { applyRecipe, recipeForExt, getExt } from '../lib/recipes.js';
import { getRecipe, recipes } from '../lib/builtin-recipes.js';

// ─── Pipeline step tests ───

describe('Recipe Pipeline', () => {
  it('strip_ansi removes ANSI codes', () => {
    const input = '\x1b[31mError\x1b[0m: something failed';
    const result = applyRecipe(input, { strip_ansi: true });
    expect(result).not.toContain('\x1b');
    expect(result).toContain('Error');
  });

  it('remove_lines drops matching lines', () => {
    const input = '// comment\ncode();\n// another comment\nmore();';
    const result = applyRecipe(input, { remove_lines: ['^\\/\\/'] });
    expect(result).not.toContain('// comment');
    expect(result).toContain('code();');
    expect(result).toContain('more();');
  });

  it('keep_lines keeps only matching lines', () => {
    const input = 'ERROR: bad\nINFO: ok\nERROR: worse\nDEBUG: trace';
    const result = applyRecipe(input, { keep_lines: ['^ERROR'] });
    expect(result).toContain('ERROR: bad');
    expect(result).toContain('ERROR: worse');
    expect(result).not.toContain('INFO');
    expect(result).not.toContain('DEBUG');
  });

  it('replace performs per-line substitution', () => {
    const input = 'foo = bar // inline comment\nbaz = qux';
    const result = applyRecipe(input, { replace: [['\\s*\\/\\/.*$', '']] });
    expect(result).toBe('foo = bar\nbaz = qux');
  });

  it('multiline_replace spans across lines', () => {
    const input = 'before\n/* block\ncomment */\nafter';
    const result = applyRecipe(input, { multiline_replace: [['\\/\\*[\\s\\S]*?\\*\\/', '']] });
    expect(result).toContain('before');
    expect(result).toContain('after');
    expect(result).not.toContain('block');
  });

  it('remove_blank_lines collapses triple+ newlines', () => {
    const input = 'a\n\n\n\n\nb';
    const result = applyRecipe(input, { remove_blank_lines: true });
    expect(result).toBe('a\n\nb');
  });

  it('max_lines truncates from head', () => {
    const input = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n');
    const result = applyRecipe(input, { max_lines: 5 });
    expect(result).toContain('line0');
    expect(result).toContain('line4');
    expect(result).toContain('truncated');
    expect(result).not.toContain('line10');
  });

  it('max_lines truncates from tail', () => {
    const input = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n');
    const result = applyRecipe(input, { max_lines: 5, lines_from: 'tail' });
    expect(result).toContain('line19');
    expect(result).not.toContain('line0');
  });

  it('max_lines truncates from both', () => {
    const input = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n');
    const result = applyRecipe(input, { max_lines: 6, lines_from: 'both' });
    expect(result).toContain('line0');
    expect(result).toContain('line19');
    expect(result).toContain('truncated');
  });

  it('on_empty provides fallback for empty results', () => {
    const input = '// only a comment';
    const result = applyRecipe(input, { remove_lines: ['^\\/\\/'], on_empty: '[nothing left]' });
    expect(result).toBe('[nothing left]');
  });

  it('returns raw text on error (fallback safety)', () => {
    const input = 'some code';
    // Bad regex should not crash
    const result = applyRecipe(input, { remove_lines: ['(((invalid'] });
    expect(result).toBe('some code');
  });

  it('returns input unchanged when recipe is null', () => {
    expect(applyRecipe('hello', null)).toBe('hello');
  });

  it('returns empty string unchanged', () => {
    expect(applyRecipe('', { strip_ansi: true })).toBe('');
  });
});

// ─── Extension routing ───

describe('Extension Routing', () => {
  it('routes JS extensions to code-js', () => {
    for (const ext of ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts']) {
      expect(recipeForExt(ext)).toBe('code-js');
    }
  });

  it('routes Python extensions to code-py', () => {
    for (const ext of ['py', 'pyw', 'pyi']) {
      expect(recipeForExt(ext)).toBe('code-py');
    }
  });

  it('routes Rust to code-rs', () => {
    expect(recipeForExt('rs')).toBe('code-rs');
  });

  it('routes Go to code-go', () => {
    expect(recipeForExt('go')).toBe('code-go');
  });

  it('routes Java to code-java', () => {
    expect(recipeForExt('java')).toBe('code-java');
  });

  it('routes C# to code-cs', () => {
    expect(recipeForExt('cs')).toBe('code-cs');
  });

  it('routes C/C++ to code-c', () => {
    for (const ext of ['c', 'h', 'cpp', 'hpp', 'cc', 'cxx']) {
      expect(recipeForExt(ext)).toBe('code-c');
    }
  });

  it('routes Terraform to code-hcl', () => {
    for (const ext of ['tf', 'tfvars', 'hcl']) {
      expect(recipeForExt(ext)).toBe('code-hcl');
    }
  });

  it('routes docs to doc', () => {
    for (const ext of ['md', 'yaml', 'yml', 'toml']) {
      expect(recipeForExt(ext)).toBe('doc');
    }
  });

  it('routes JSON to json-compact', () => {
    expect(recipeForExt('json')).toBe('json-compact');
    expect(recipeForExt('jsonc')).toBe('json-compact');
  });

  it('routes logs to log recipe', () => {
    expect(recipeForExt('log')).toBe('log');
    expect(recipeForExt('txt')).toBe('log');
  });

  it('routes unknown extensions to code-generic', () => {
    expect(recipeForExt('xyz')).toBe('code-generic');
    expect(recipeForExt('')).toBe('code-generic');
  });

  it('getExt extracts correctly', () => {
    expect(getExt('/foo/bar.ts')).toBe('ts');
    expect(getExt('file.test.js')).toBe('js');
    expect(getExt('Makefile')).toBe('makefile');
  });
});

// ─── Per-language recipe tests ───

describe('Language Recipes', () => {
  it('code-js strips comments and trailing comments', () => {
    const input = `
// This is a comment
import { foo } from 'bar';
const x = 1; // inline
/** JSDoc block */
console.log(x);
export default x;
    `.trim();
    const recipe = getRecipe('code-js');
    const result = applyRecipe(input, recipe);
    expect(result).not.toContain('This is a comment');
    expect(result).not.toContain('console.log');
    expect(result).not.toContain('JSDoc');
    expect(result).not.toContain('// inline');
    expect(result).toContain("import { foo } from 'bar'");
    expect(result).toContain('const x = 1');
    expect(result).toContain('export default x');
  });

  it('code-py strips comments, docstrings, type hints', () => {
    const input = `
# Comment
"""Module docstring"""
def foo(x: int, y: str = "bar") -> bool:
    """Function docstring"""
    # inner comment
    print("debug")
    logger.info("log")
    return True
    `.trim();
    const recipe = getRecipe('code-py');
    const result = applyRecipe(input, recipe);
    expect(result).not.toContain('# Comment');
    expect(result).not.toContain('Module docstring');
    expect(result).not.toContain('Function docstring');
    expect(result).not.toContain('print("debug")');
    expect(result).not.toContain('logger.info');
    expect(result).toContain('def foo');
    expect(result).toContain('return True');
  });

  it('code-rs strips doc comments and attributes', () => {
    const input = `
/// Doc comment
//! Inner doc
// Regular comment
#[allow(dead_code)]
pub fn main() {
    let x = 1;
}
    `.trim();
    const recipe = getRecipe('code-rs');
    const result = applyRecipe(input, recipe);
    expect(result).not.toContain('Doc comment');
    expect(result).not.toContain('Inner doc');
    expect(result).not.toContain('Regular comment');
    expect(result).not.toContain('#[allow');
    expect(result).toContain('pub fn main()');
  });

  it('code-java strips Javadoc and @Override', () => {
    const input = `
/**
 * Does something important.
 * @param x the value
 */
@Override
public void doThing(int x) {
    System.out.println(x);
    return;
}
    `.trim();
    const recipe = getRecipe('code-java');
    const result = applyRecipe(input, recipe);
    expect(result).not.toContain('Does something');
    expect(result).not.toContain('@Override');
    expect(result).not.toContain('System.out');
    expect(result).toContain('public void doThing');
  });

  it('code-cs strips XML doc comments and regions', () => {
    const input = `
/// <summary>A summary</summary>
// Line comment
#region MyRegion
public class Foo {
    Console.WriteLine("test");
}
#endregion
    `.trim();
    const recipe = getRecipe('code-cs');
    const result = applyRecipe(input, recipe);
    expect(result).not.toContain('summary');
    expect(result).not.toContain('#region');
    expect(result).not.toContain('#endregion');
    expect(result).not.toContain('Console.Write');
    expect(result).toContain('public class Foo');
  });

  it('code-hcl strips comments and descriptions', () => {
    const input = `
# Main config
variable "name" {
  description = "The resource name"
  type        = string
  default     = "foo"
}
    `.trim();
    const recipe = getRecipe('code-hcl');
    const result = applyRecipe(input, recipe);
    expect(result).not.toContain('# Main config');
    expect(result).not.toContain('description');
    expect(result).toContain('variable "name"');
    expect(result).toContain('default');
  });

  it('all Tier 1 recipes exist and are well-formed', () => {
    const tier1 = ['code-js', 'code-py', 'code-rs', 'code-go', 'code-java', 'code-cs', 'code-c'];
    for (const name of tier1) {
      const recipe = recipes[name];
      expect(recipe, `${name} should exist`).toBeDefined();
      expect(recipe.strip_ansi).toBe(true);
      expect(recipe.remove_blank_lines).toBe(true);
    }
  });

  it('all recipes produce output (never crash)', () => {
    const testCode = 'function foo() { return 1; }\n// comment\nconst x = 2;';
    for (const [name, recipe] of Object.entries(recipes)) {
      const result = applyRecipe(testCode, recipe);
      expect(typeof result, `${name} should return string`).toBe('string');
    }
  });
});
