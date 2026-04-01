// 9-step filter pipeline: strip_ansi → remove_lines → keep_lines → replace →
// multiline_replace → dedup_lines → remove_blank_lines → max_lines → on_empty

import { stripAnsi } from './strip-ansi.js';
import { deduplicateLines } from './line-dedup.js';

export function applyRecipe(text, recipe) {
  if (!text || !recipe) return text;

  try {
    let result = text;

    // 1. strip_ansi
    if (recipe.strip_ansi !== false) {
      result = stripAnsi(result);
    }

    // 2. remove_lines — drop lines matching any regex
    if (recipe.remove_lines && recipe.remove_lines.length > 0) {
      const patterns = recipe.remove_lines.map(p => new RegExp(p));
      result = result
        .split('\n')
        .filter(line => !patterns.some(re => re.test(line)))
        .join('\n');
    }

    // 3. keep_lines — keep only lines matching at least one regex
    if (recipe.keep_lines && recipe.keep_lines.length > 0) {
      const patterns = recipe.keep_lines.map(p => new RegExp(p));
      result = result
        .split('\n')
        .filter(line => patterns.some(re => re.test(line)))
        .join('\n');
    }

    // 4. replace — regex substitution within each line
    if (recipe.replace && recipe.replace.length > 0) {
      for (const [pattern, replacement] of recipe.replace) {
        const re = new RegExp(pattern, 'g');
        result = result
          .split('\n')
          .map(line => line.replace(re, replacement || ''))
          .join('\n');
      }
    }

    // 5. multiline_replace — regex substitution on full text
    if (recipe.multiline_replace && recipe.multiline_replace.length > 0) {
      for (const [pattern, replacement] of recipe.multiline_replace) {
        const re = new RegExp(pattern, 'gs');
        result = result.replace(re, replacement || '');
      }
    }

    // 6. dedup_lines — collapse consecutive identical/similar lines
    if (recipe.dedup_lines) {
      const threshold = typeof recipe.dedup_lines === 'number' ? recipe.dedup_lines : 3;
      result = deduplicateLines(result, threshold);
    }

    // 7. remove_blank_lines — collapse consecutive blank lines
    if (recipe.remove_blank_lines !== false) {
      result = result.replace(/\n{3,}/g, '\n\n');
    }

    // 8. max_lines — truncate
    if (recipe.max_lines && recipe.max_lines > 0) {
      const lines = result.split('\n');
      if (lines.length > recipe.max_lines) {
        const from = recipe.lines_from || 'head';
        if (from === 'tail') {
          result = lines.slice(-recipe.max_lines).join('\n');
        } else if (from === 'both') {
          const half = Math.floor(recipe.max_lines / 2);
          const head = lines.slice(0, half);
          const tail = lines.slice(-half);
          result = [...head, `// ... [${lines.length - recipe.max_lines} lines truncated]`, ...tail].join('\n');
        } else {
          // head (default)
          result = lines.slice(0, recipe.max_lines).join('\n')
            + `\n// ... [${lines.length - recipe.max_lines} more lines truncated]`;
        }
      }
    }

    // 9. on_empty — fallback message if result is empty
    if (recipe.on_empty && result.trim() === '') {
      result = recipe.on_empty;
    }

    return result;
  } catch (e) {
    // Fallback safety: return raw on any error
    return text;
  }
}

// Adaptive compression: adjust recipe aggressiveness based on input size
export function adaptRecipe(recipe, lineCount) {
  if (!recipe || lineCount <= 0) return recipe;

  // < 50 lines: light touch — only strip ANSI and blank lines
  if (lineCount < 50) {
    return {
      strip_ansi: recipe.strip_ansi,
      remove_blank_lines: recipe.remove_blank_lines,
      on_empty: recipe.on_empty,
    };
  }

  // 50–500 lines: normal recipe (no change)
  if (lineCount <= 500) {
    return recipe;
  }

  // > 500 lines: aggressive — add tighter max_lines and extra stripping
  return {
    ...recipe,
    max_lines: recipe.max_lines || 400,
    lines_from: recipe.lines_from || 'both',
  };
}

// Route file extension to recipe name
export function recipeForExt(ext) {
  const map = {
    js: 'code-js', jsx: 'code-js', mjs: 'code-js', cjs: 'code-js',
    ts: 'code-js', tsx: 'code-js', mts: 'code-js', cts: 'code-js',
    py: 'code-py', pyw: 'code-py', pyi: 'code-py',
    rs: 'code-rs',
    go: 'code-go',
    java: 'code-java',
    cs: 'code-cs',
    c: 'code-c', h: 'code-c', cpp: 'code-c', hpp: 'code-c', cc: 'code-c', cxx: 'code-c',
    rb: 'code-rb',
    php: 'code-php',
    swift: 'code-swift',
    kt: 'code-kt', kts: 'code-kt',
    scala: 'code-scala',
    tf: 'code-hcl', tfvars: 'code-hcl', hcl: 'code-hcl',
    md: 'doc', mdx: 'doc',
    json: 'json-compact', jsonc: 'json-compact',
    yaml: 'doc', yml: 'doc',
    toml: 'doc',
    html: 'doc', htm: 'doc',
    css: 'code-css', scss: 'code-css', less: 'code-css',
    xml: 'doc-xml',
    ini: 'doc', cfg: 'doc', env: 'doc', conf: 'doc',
    log: 'log', txt: 'log', csv: 'doc',
  };
  return map[ext] || 'code-generic';
}

export function getExt(filePath) {
  return (filePath.split('.').pop() || '').toLowerCase();
}
