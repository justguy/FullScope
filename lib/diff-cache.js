// Diff-based re-read dedup.
// In-memory cache: on re-read, if file unchanged → "[unchanged]".
// If change ratio < 30% → return compact diff instead of full re-read.
// Capped at 100 entries (LRU eviction).

import { readFileSync, statSync } from 'fs';
import { createHash } from 'crypto';

const MAX_CACHE_SIZE = 100;

// Map<filePath, { mtime, size, hash, lines }>
const cache = new Map();

function hashContent(content) {
  return createHash('md5').update(content).digest('hex');
}

function evictIfNeeded() {
  if (cache.size <= MAX_CACHE_SIZE) return;
  // Evict oldest entry (first key in insertion order)
  const oldest = cache.keys().next().value;
  cache.delete(oldest);
}

// Check cache and return diff result, or null if no cache hit
export function checkDiffCache(filePath) {
  const entry = cache.get(filePath);
  if (!entry) return null;

  // Fast freshness check: mtime + size
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    cache.delete(filePath);
    return null;
  }

  const currentMtime = stat.mtimeMs;
  const currentSize = stat.size;

  // If mtime and size match, file hasn't changed
  if (currentMtime === entry.mtime && currentSize === entry.size) {
    return {
      type: 'unchanged',
      message: `[fullscope: re-read — file unchanged since last read, 0 tokens needed]\n${filePath}: no changes since last read.`,
    };
  }

  // File changed — read and compare
  const raw = readFileSync(filePath, 'utf-8');
  const newHash = hashContent(raw);

  if (newHash === entry.hash) {
    // Content identical despite mtime change (e.g. touch)
    // Update mtime in cache
    entry.mtime = currentMtime;
    entry.size = currentSize;
    return {
      type: 'unchanged',
      message: `[fullscope: re-read — file unchanged since last read, 0 tokens needed]\n${filePath}: no changes since last read.`,
    };
  }

  // Compute diff
  const newLines = raw.split('\n');
  const diff = computeCompactDiff(entry.lines, newLines);

  // If change ratio > 30%, don't use diff (full re-read is clearer)
  if (diff.changeRatio > 0.3) {
    return null; // signal caller to do a full re-read
  }

  // Update cache with new content so future diffs are against latest
  cache.delete(filePath);
  cache.set(filePath, {
    mtime: currentMtime,
    size: currentSize,
    hash: hashContent(raw),
    lines: newLines,
  });

  return {
    type: 'diff',
    raw,
    message: `[fullscope: re-read — ${diff.changedLines} lines changed (${(diff.changeRatio * 100).toFixed(0)}%), showing diff]\n${diff.text}`,
  };
}

// Store file content in cache after a read
export function updateDiffCache(filePath, content) {
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return;
  }

  evictIfNeeded();

  // Move to end of map (LRU: re-insert)
  cache.delete(filePath);
  cache.set(filePath, {
    mtime: stat.mtimeMs,
    size: stat.size,
    hash: hashContent(content),
    lines: content.split('\n'),
  });
}

// Compact unified-style diff
function computeCompactDiff(oldLines, newLines) {
  const hunks = [];
  let changedLines = 0;

  // Simple LCS-based diff using a line-matching approach
  const oldSet = new Map(); // line content → array of indices
  for (let i = 0; i < oldLines.length; i++) {
    const key = oldLines[i];
    if (!oldSet.has(key)) oldSet.set(key, []);
    oldSet.get(key).push(i);
  }

  // Walk through new lines, find changes
  let oi = 0;
  let ni = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      oi++;
      ni++;
      continue;
    }

    // Found a difference — collect the hunk
    const hunkStart = ni;
    const oldStart = oi;
    const removed = [];
    const added = [];

    // Advance past differing lines
    while (oi < oldLines.length && ni < newLines.length && oldLines[oi] !== newLines[ni]) {
      removed.push(oldLines[oi]);
      added.push(newLines[ni]);
      oi++;
      ni++;
    }

    // Handle remaining (insertion or deletion)
    while (oi < oldLines.length && (ni >= newLines.length || oldLines[oi] !== newLines[ni])) {
      removed.push(oldLines[oi]);
      oi++;
    }
    while (ni < newLines.length && (oi >= oldLines.length || oldLines[oi] !== newLines[ni])) {
      added.push(newLines[ni]);
      ni++;
    }

    if (removed.length > 0 || added.length > 0) {
      changedLines += removed.length + added.length;
      hunks.push({
        oldLine: oldStart + 1,
        newLine: hunkStart + 1,
        removed,
        added,
      });
    }
  }

  // Format hunks
  const parts = [];
  for (const hunk of hunks) {
    parts.push(`@@ line ${hunk.newLine} @@`);
    for (const r of hunk.removed) parts.push(`- ${r}`);
    for (const a of hunk.added) parts.push(`+ ${a}`);
  }

  const totalLines = Math.max(oldLines.length, newLines.length);
  return {
    text: parts.join('\n'),
    changedLines,
    changeRatio: totalLines > 0 ? changedLines / totalLines : 0,
  };
}

export function clearDiffCache() {
  cache.clear();
}

export function getDiffCacheSize() {
  return cache.size;
}
