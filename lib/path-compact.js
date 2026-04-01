// Path compaction — strip common project root prefix from paths.
// Turns "/Users/foo/project/src/main.rs" into "src/main.rs"

let _projectRoot = null;

export function setProjectRoot(root) {
  _projectRoot = root ? root.replace(/\/$/, '') : null;
}

export function getProjectRoot() {
  return _projectRoot || process.cwd();
}

export function compactPath(fullPath) {
  const root = getProjectRoot();
  if (!fullPath || !root) return fullPath;
  if (fullPath.startsWith(root + '/')) {
    return fullPath.slice(root.length + 1);
  }
  return fullPath;
}

export function compactPaths(text, root) {
  const r = root || getProjectRoot();
  if (!r) return text;
  // Replace all occurrences of the root prefix in text
  const escaped = r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped + '/', 'g'), '');
}
