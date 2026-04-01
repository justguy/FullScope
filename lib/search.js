// Compressed grep — ripgrep wrapper with recipe filtering
// Uses execFileSync with argument arrays to prevent command injection.

import { execFileSync, execSync } from 'child_process';
import { statSync } from 'fs';
import { resolve } from 'path';
import { applyRecipe } from './recipes.js';
import { compactPaths } from './path-compact.js';

function findRg() {
  const candidates = [
    '/opt/homebrew/bin/rg',
    '/usr/local/bin/rg',
    '/usr/bin/rg',
  ];
  for (const c of candidates) {
    try { if (statSync(c).isFile()) return c; } catch {}
  }
  try { return execSync('/usr/bin/which rg 2>/dev/null').toString().trim(); } catch {}
  return null;
}

const RG_PATH = findRg();

// Validate that search path is within a safe boundary
function validatePath(searchPath) {
  const resolved = resolve(searchPath);
  // Block obviously dangerous paths
  if (resolved === '/' || resolved === '/etc' || resolved === '/usr') {
    throw new Error(`Search path "${resolved}" is too broad. Provide a project directory.`);
  }
  return resolved;
}

export function runSearch(pattern, path, glob, maxResults) {
  const limit = maxResults || 100;
  const searchPath = validatePath(path || process.cwd());

  // Build argument arrays — never interpolate into a shell string
  if (RG_PATH) {
    const args = ['-n', '--no-heading', '--max-count', String(limit)];
    if (glob) args.push('--glob', glob);
    args.push('--', pattern, searchPath);

    try {
      return execFileSync(RG_PATH, args, {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (e) {
      if (e.stdout) return e.stdout;
      return '';
    }
  }

  // Fallback: grep with argument array
  const args = ['-rn'];
  if (glob) args.push(`--include=${glob}`);
  args.push('--', pattern, searchPath);

  try {
    const raw = execFileSync('grep', args, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
    // Manual limit (grep has no --max-count equivalent for total lines across files)
    const lines = raw.split('\n');
    return lines.slice(0, limit).join('\n');
  } catch (e) {
    if (e.stdout) {
      const lines = e.stdout.split('\n');
      return lines.slice(0, limit).join('\n');
    }
    return '';
  }
}

export function filterSearchResults(raw) {
  if (!raw || raw.trim() === '') return raw;

  // Compact paths first
  let result = compactPaths(raw);

  // Apply a light recipe: strip comments from matched lines
  const recipe = {
    strip_ansi: true,
    remove_blank_lines: true,
  };

  return applyRecipe(result, recipe);
}
