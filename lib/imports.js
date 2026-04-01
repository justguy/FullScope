// Import/export extraction per language — regex-based (no AST needed).
// Returns { imports: string[], exports: string[] }

const PATTERNS = {
  js: {
    imports: [
      /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g,
      /import\s+['"]([^'"]+)['"]/g,
      /(?:const|let|var)\s+(?:{([^}]+)}|(\w+))\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ],
    exports: [
      /export\s+(?:default\s+)?(function|class|const|let|var)\s+(\w+)/g,
      /export\s+{([^}]+)}/g,
      /module\.exports\s*=\s*{([^}]+)}/g,
      /module\.exports\s*=\s*(\w+)/g,
    ],
  },
  py: {
    imports: [
      /^from\s+(\S+)\s+import\s+(.+)$/gm,
      /^import\s+(.+)$/gm,
    ],
    exports: [
      /^(?:def|class|async\s+def)\s+(\w+)/gm,
      /^(\w+)\s*=/gm, // module-level assignments (rough)
    ],
  },
  rs: {
    imports: [
      /^use\s+(.+);$/gm,
    ],
    exports: [
      /^pub\s+(?:fn|struct|enum|trait|type|mod|const|static)\s+(\w+)/gm,
    ],
  },
  go: {
    imports: [
      /^\s*"([^"]+)"$/gm,
      /^\s*(\w+)\s+"([^"]+)"$/gm,
    ],
    exports: [
      /^func\s+([A-Z]\w*)/gm,
      /^func\s+\([^)]+\)\s+([A-Z]\w*)/gm,  // method receivers
      /^type\s+([A-Z]\w*)\s+/gm,
      /^var\s+([A-Z]\w*)\s+/gm,
    ],
  },
  java: {
    imports: [
      /^import\s+(?:static\s+)?([^;]+);$/gm,
    ],
    exports: [
      /(?:public|protected)\s+(?:static\s+)?(?:final\s+)?(?:class|interface|enum|record)\s+(\w+)/g,
      /(?:public|protected)\s+(?:static\s+)?(?:final\s+)?[\w<>\[\], ]+\s+(\w+)\s*\(/g,
    ],
  },
  cs: {
    imports: [
      /^using\s+([^;]+);$/gm,
    ],
    exports: [
      /(?:public|protected|internal)\s+(?:static\s+)?(?:partial\s+)?(?:class|interface|enum|struct|record)\s+(\w+)/g,
      /(?:public|protected|internal)\s+(?:static\s+)?(?:virtual\s+)?(?:override\s+)?(?:async\s+)?[\w<>\[\], ]+\s+(\w+)\s*\(/g,
    ],
  },
};

const EXT_TO_LANG = {
  js: 'js', jsx: 'js', mjs: 'js', cjs: 'js',
  ts: 'js', tsx: 'js', mts: 'js', cts: 'js',
  py: 'py', pyw: 'py', pyi: 'py',
  rs: 'rs',
  go: 'go',
  java: 'java',
  cs: 'cs',
};

function extractMatches(code, patterns) {
  const results = new Set();
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m;
    while ((m = re.exec(code)) !== null) {
      // Grab all captured groups, pick the most meaningful one
      for (let i = 1; i < m.length; i++) {
        if (m[i]) {
          // Split on comma for destructured imports/exports
          const parts = m[i].split(',').map(s => s.trim().replace(/\s+as\s+\w+/, ''));
          for (const p of parts) {
            if (p && p.length < 80 && /^\w/.test(p)) {
              results.add(p);
            }
          }
        }
      }
    }
  }
  return [...results];
}

export function extractImportsExports(code, ext) {
  const lang = EXT_TO_LANG[ext];
  if (!lang || !PATTERNS[lang]) {
    return { imports: [], exports: [] };
  }

  const { imports: importPatterns, exports: exportPatterns } = PATTERNS[lang];

  return {
    imports: extractMatches(code, importPatterns),
    exports: extractMatches(code, exportPatterns),
  };
}

export function formatImportExportHeader(ie, commentPrefix = '//') {
  const lines = [];
  if (ie.exports.length > 0) {
    lines.push(`${commentPrefix} EXPORTS: { ${ie.exports.join(', ')} }`);
  }
  if (ie.imports.length > 0) {
    lines.push(`${commentPrefix} IMPORTS: { ${ie.imports.join(', ')} }`);
  }
  return lines.join('\n');
}
