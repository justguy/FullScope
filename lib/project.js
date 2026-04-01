// fullscope_project: codebase orientation — tree + configs + git status + entry points

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, basename, relative } from 'path';
import { execSync } from 'child_process';
import { applyRecipe } from './recipes.js';
import { getRecipe } from './builtin-recipes.js';

const MAX_DEPTH = 6;
const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', '.next',
  '__pycache__', '.pytest_cache', '.mypy_cache', 'target', '.cargo',
  'vendor', '.tox', 'coverage', '.nyc_output', '.turbo', '.cache',
  'bin', 'obj', // C#
]);

// ─── .gitignore support ───

function parseGitignore(dir) {
  const gitignorePath = join(dir, '.gitignore');
  if (!existsSync(gitignorePath)) return null;

  try {
    const content = readFileSync(gitignorePath, 'utf-8');
    const patterns = content
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(pattern => {
        // Convert gitignore glob patterns to simple matchers
        // Strip trailing slashes (directory-only markers)
        const p = pattern.replace(/\/$/, '');
        // Convert leading slash to exact match from root
        if (p.startsWith('/')) return { exact: p.slice(1), negated: false };
        // Negation patterns
        if (p.startsWith('!')) return { pattern: p.slice(1), negated: true };
        // Simple name match (applies at any depth)
        return { pattern: p, negated: false };
      });
    return patterns;
  } catch {
    return null;
  }
}

function isGitignored(name, gitignorePatterns) {
  if (!gitignorePatterns) return false;

  let ignored = false;
  for (const rule of gitignorePatterns) {
    if (rule.negated) {
      // Negation: un-ignore if it was ignored
      if (matchesPattern(name, rule.pattern)) ignored = false;
    } else {
      const pat = rule.exact || rule.pattern;
      if (matchesPattern(name, pat)) ignored = true;
    }
  }
  return ignored;
}

function matchesPattern(name, pattern) {
  // Simple glob matching: supports * and **
  // Convert glob to regex
  const re = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{DOUBLESTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{DOUBLESTAR\}\}/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${re}$`).test(name);
}

const CONFIG_FILES = [
  'package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod',
  'pom.xml', 'build.gradle', 'build.gradle.kts',
  'Makefile', 'CMakeLists.txt', 'docker-compose.yml',
  'tsconfig.json', '.env.example',
];

// ─── Tree generation ───

function buildTree(dir, depth, visited, prefix = '', gitignorePatterns = null) {
  if (depth > MAX_DEPTH) return [prefix + '... [max depth reached]'];

  let realPath;
  try {
    realPath = statSync(dir).ino;
  } catch { return []; }

  if (visited.has(realPath)) return [prefix + '... [circular]'];
  visited.add(realPath);

  // Parse .gitignore at this level (merges with parent patterns)
  const localGitignore = parseGitignore(dir);
  const patterns = localGitignore
    ? (gitignorePatterns ? [...gitignorePatterns, ...localGitignore] : localGitignore)
    : gitignorePatterns;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.') && !IGNORED_DIRS.has(e.name) && !isGitignored(e.name, patterns))
      .sort((a, b) => {
        // dirs first, then files
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });
  } catch { return []; }

  const lines = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    if (e.isDirectory()) {
      lines.push(prefix + connector + e.name + '/');
      lines.push(...buildTree(join(dir, e.name), depth + 1, visited, prefix + childPrefix, patterns));
    } else {
      lines.push(prefix + connector + e.name);
    }
  }

  return lines;
}

// ─── Entry point detection ───

function detectEntryPoints(dir) {
  const entryPoints = [];

  // package.json main/bin
  const pkgPath = join(dir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.main) entryPoints.push({ file: pkg.main, reason: 'package.json#main' });
      if (pkg.bin) {
        const bins = typeof pkg.bin === 'string' ? { [pkg.name]: pkg.bin } : pkg.bin;
        for (const [name, path] of Object.entries(bins)) {
          entryPoints.push({ file: path, reason: `package.json#bin[${name}]` });
        }
      }
    } catch {}
  }

  // Cargo.toml
  const cargoPath = join(dir, 'Cargo.toml');
  if (existsSync(cargoPath)) {
    try {
      const cargo = readFileSync(cargoPath, 'utf-8');
      if (cargo.includes('[[bin]]')) {
        const matches = cargo.matchAll(/name\s*=\s*"([^"]+)"/g);
        for (const m of matches) {
          entryPoints.push({ file: `src/${m[1]}.rs`, reason: 'Cargo.toml [[bin]]' });
        }
      }
      if (existsSync(join(dir, 'src/main.rs'))) {
        entryPoints.push({ file: 'src/main.rs', reason: 'Cargo.toml default binary' });
      }
      if (existsSync(join(dir, 'src/lib.rs'))) {
        entryPoints.push({ file: 'src/lib.rs', reason: 'Cargo.toml default library' });
      }
    } catch {}
  }

  // pyproject.toml
  const pyPath = join(dir, 'pyproject.toml');
  if (existsSync(pyPath)) {
    try {
      const py = readFileSync(pyPath, 'utf-8');
      const scripts = py.match(/\[project\.scripts\][\s\S]*?(?=\n\[|\n$)/);
      if (scripts) {
        const entries = scripts[0].matchAll(/(\w+)\s*=\s*"([^"]+)"/g);
        for (const m of entries) {
          entryPoints.push({ file: m[2], reason: `pyproject.toml scripts[${m[1]}]` });
        }
      }
    } catch {}
  }

  // go.mod + main.go
  if (existsSync(join(dir, 'go.mod'))) {
    if (existsSync(join(dir, 'main.go'))) {
      entryPoints.push({ file: 'main.go', reason: 'Go main package' });
    }
    if (existsSync(join(dir, 'cmd'))) {
      try {
        const cmds = readdirSync(join(dir, 'cmd'), { withFileTypes: true })
          .filter(e => e.isDirectory());
        for (const c of cmds) {
          entryPoints.push({ file: `cmd/${c.name}/main.go`, reason: `Go cmd/${c.name}` });
        }
      } catch {}
    }
  }

  return entryPoints;
}

// ─── Entry point hot-linking: find top imports of entry files ───

function findTopImports(dir, filePath, limit = 5) {
  const fullPath = join(dir, filePath);
  if (!existsSync(fullPath)) return [];

  try {
    const code = readFileSync(fullPath, 'utf-8');
    const imports = [];

    // JS/TS imports
    const jsImports = code.matchAll(/(?:import|from)\s+['"]([^'"]+)['"]/g);
    for (const m of jsImports) {
      if (!m[1].startsWith('.')) continue; // skip node_modules
      imports.push(m[1]);
    }

    // Rust use
    const rsUse = code.matchAll(/^use\s+(crate::\S+)/gm);
    for (const m of rsUse) imports.push(m[1]);

    // Python from X import
    const pyImports = code.matchAll(/^from\s+(\S+)\s+import/gm);
    for (const m of pyImports) {
      if (!m[1].startsWith('.') && !m[1].includes('.')) continue;
      imports.push(m[1]);
    }

    return imports.slice(0, limit);
  } catch {
    return [];
  }
}

// ─── Git status ───

function getGitStatus(dir) {
  try {
    const status = execSync('git status --porcelain -b 2>/dev/null', {
      cwd: dir, encoding: 'utf-8', timeout: 3000,
    });
    const lines = status.trim().split('\n');
    const branch = lines[0]?.replace(/^## /, '') || 'unknown';
    const changes = lines.slice(1).length;
    return `Branch: ${branch} | ${changes} changed file${changes !== 1 ? 's' : ''}`;
  } catch {
    return 'Not a git repository';
  }
}

// ─── Compressed config ───

function readCompressedConfig(dir, fileName) {
  const path = join(dir, fileName);
  if (!existsSync(path)) return null;

  try {
    const raw = readFileSync(path, 'utf-8');
    // For JSON, strip whitespace and truncate
    if (fileName.endsWith('.json')) {
      try {
        const parsed = JSON.parse(raw);
        // Keep only key fields
        if (fileName === 'package.json') {
          const slim = {
            name: parsed.name, version: parsed.version,
            main: parsed.main, bin: parsed.bin,
            scripts: parsed.scripts ? Object.keys(parsed.scripts) : undefined,
            dependencies: parsed.dependencies ? Object.keys(parsed.dependencies) : undefined,
          };
          return JSON.stringify(slim, null, 1);
        }
        // Generic: truncate
        const str = JSON.stringify(parsed, null, 1);
        if (str.length > 500) return str.slice(0, 500) + '\n// ... [truncated]';
        return str;
      } catch {}
    }
    // For everything else, truncate to 30 lines
    const lines = raw.split('\n');
    if (lines.length > 30) {
      return lines.slice(0, 30).join('\n') + '\n# ... [truncated]';
    }
    return raw;
  } catch {
    return null;
  }
}

// ─── Main export ───

export function generateProjectOverview(dir) {
  const projectDir = dir || process.cwd();
  const parts = [];

  // 1. Project name
  parts.push(`# ${basename(projectDir)}\n`);

  // 2. Git status
  parts.push(`## Git\n${getGitStatus(projectDir)}\n`);

  // 3. Entry points
  const entryPoints = detectEntryPoints(projectDir);
  if (entryPoints.length > 0) {
    parts.push('## Entry Points');
    for (const ep of entryPoints) {
      const imports = findTopImports(projectDir, ep.file);
      let line = `  → ${ep.file} (${ep.reason})`;
      if (imports.length > 0) {
        line += `\n    depends on: ${imports.join(', ')}`;
      }
      parts.push(line);
    }
    parts.push('');
  }

  // 4. Directory tree
  const visited = new Set();
  const tree = buildTree(projectDir, 0, visited);
  parts.push('## Structure\n```');
  parts.push(tree.join('\n'));
  parts.push('```\n');

  // 5. Config files
  const configs = [];
  for (const cf of CONFIG_FILES) {
    const content = readCompressedConfig(projectDir, cf);
    if (content) {
      configs.push(`### ${cf}\n\`\`\`\n${content}\n\`\`\``);
    }
  }
  if (configs.length > 0) {
    parts.push('## Config Files\n');
    parts.push(configs.join('\n\n'));
  }

  return parts.join('\n');
}
