# Integrity & Safety Verification

fullscope is a read-only minification layer. This document proves it.

All results below are reproducible:

```bash
npm run verify-integrity    # SHA-256 hash verification (scripts/verify-integrity.js)
npm test                    # 271 tests across 17 files (including 17 integrity tests)
```

---

## 1. File Integrity -- Zero Byte-Level Changes

Every fullscope operation reads files but never writes to them. This is verified by SHA-256 hashing 34 files before and after 203 operations.

### Operations executed between hashes

- `fullscope_context` on all 34 files (18 lib modules + 16 fixtures) — 34 ops
- `fullscope_skeleton` on all 34 files — 34 ops
- `fullscope_expand` x96 (6 function names tried on each of 16 fixtures) — 96 ops
- `fullscope_verify_line` x16 (4 calls per fixture: lines 1, 50, 130, OOB; tracked as 1 op per fixture) — 16 ops
- `fullscope_search` x3 (including shell injection attempt) — 3 ops
- `fullscope_usages` x2 — 2 ops
- `fullscope_project` x1 — 1 op
- `fullscope_batch_context` x1 (16 fixtures, with intent + budget) — 1 op
- `addMarkersAfterFilter` on all 16 fixtures — 16 ops
- **Total: 203 operations**

### Results

```
  779dd15d1325  OK  index.js
  7c0c57f8a698  OK  lib/batch.js
  57a616aa229f  OK  lib/builtin-recipes.js
  02496fa33c35  OK  lib/diff-cache.js
  9361421ecd22  OK  lib/expand.js
  fd8c2722df98  OK  lib/imports.js
  f61747e34450  OK  lib/json-compress.js
  4cc9a372dc95  OK  lib/line-dedup.js
  2fd3c5bd4e78  OK  lib/line-markers.js
  3798347ba60e  OK  lib/path-compact.js
  3d3387adff55  OK  lib/project.js
  b7ab6e75a108  OK  lib/recipes.js
  9c246d18c7e2  OK  lib/search.js
  2dbc3bb25038  OK  lib/skeleton.js
  abd8f274e674  OK  lib/strip-ansi.js
  5737ee694b47  OK  lib/tokens.js
  5ee898cc0527  OK  lib/usages.js
  1be85cc36d0c  OK  lib/verify.js
  8a77b9c3a63e  OK  test/fixtures/AuthController.cs
  e02d685be4b5  OK  test/fixtures/AuthController.java
  deeafca40514  OK  test/fixtures/README-heavy.md
  4d7c4717109b  OK  test/fixtures/api-handler.py
  dc002c6e3354  OK  test/fixtures/api-response.json
  53cfbf4296d3  OK  test/fixtures/auth-service.js
  a938ab5c1397  OK  test/fixtures/broken.json
  cf62ce256b27  OK  test/fixtures/broken.yml
  d60ab538d51c  OK  test/fixtures/dashboard.html
  d950cef3968a  OK  test/fixtures/docker-compose.yml
  6e197a18be0f  OK  test/fixtures/http-handler.go
  e9c7218294ac  OK  test/fixtures/registry.rs
  cd5146c39d45  OK  test/fixtures/server.log
  a6132da15d08  OK  test/fixtures/server.ts
  d24d44b79c72  OK  test/fixtures/small-config.toml
  1fac79c568cb  OK  test/fixtures/styles.css

  34 files checked, 203 operations run
  RESULT: ALL FILES UNCHANGED. Zero byte-level modifications.
```

Full results with timestamps in `data/integrity-results.json`.

---

## 2. Line Mapping Accuracy

When fullscope strips lines (comments, docstrings, whitespace), it inserts virtual markers:

```
       // ... [10 lines stripped]
    11 import { db } from './db';
    12 import { config } from './config';
       // ... [14 lines stripped]
    39 export class AuthService extends EventEmitter {
```

**Verified properties** (automated in `test/integrity.test.js`).
Note: line-number recovery after compression uses text matching, which is heuristic. Repeated identical lines (e.g. multiple `}` or duplicate imports) could theoretically mis-anchor. Verified correct for all current fixtures and common code patterns. Always use `fullscope_verify_line` to confirm line content before editing.

- Every surviving line in compressed output exists verbatim in the original file
- Line numbers in compressed output match the original file's line numbers
- `fullscope_verify_line(file, 130, "async login")` → `Match: confirmed`
- `fullscope_verify_line(file, 1, "THIS DOES NOT EXIST")` → `Mismatch` detected
- `fullscope_expand fn:login` returns lines 130-214, and line 130 in the raw file contains `login`

---

## 3. Seamless Workflow

fullscope is designed for reading, not editing. The intended workflow:

```
1. fullscope_skeleton   → understand structure       (read-only, 94% saved)
2. fullscope_expand     → inspect specific function  (read-only, per-function)
3. raw read       → get exact file content     (for editing)
4. edit           → apply changes              (via agent's native tools)
```

Steps 1-2 use fullscope. Steps 3-4 use the agent's built-in file tools. No transformations are applied to source files at any point. Every compressed output includes a footer warning against using it for editing.

---

## 4. Failure Safety

When minification encounters problems, it fails safe — no crash, no corruption, no silent data loss.

| Scenario | Behavior | Tested |
|----------|----------|--------|
| Malformed input (binary, control chars) | Returns content as-is | Yes |
| Missing function (bad expand handle) | `"Function not found"` | Yes |
| Invalid handle format | `"Invalid handle format"` | Yes |
| Line number out of range | `"Line N is out of range"` | Yes |
| Missing file | Readable error with path | Yes |
| Unknown file extension | Falls back to generic recipe | Yes |
| Empty input | Returns empty string | Yes |
| Shell metacharacters in search | No execution, safe return | Yes |

---

## 5. Search Safety

`fullscope_search` and `fullscope_usages` use `execFileSync` with argument arrays. User-supplied patterns, paths, and globs are never interpolated into shell command strings.

Tested: passing `$(echo injection)` as a search pattern does not execute it. Verified in the integrity script above (operation #3 of fullscope_search).

---

## Summary

| Test | Method | Result |
|------|--------|--------|
| File hash unchanged after all operations | SHA-256, 34 files, 203 ops | All match |
| Compressed lines match original content | Line-by-line comparison | 100% |
| Line numbers preserved via virtual markers | Structural verification | Verified |
| verify_line confirms content correctly | Expected content matching | Verified |
| verify_line detects mismatches | Negative test | Verified |
| expand returns correct line ranges | Range + content check | Verified |
| Failure modes produce readable errors | 7 edge cases | All pass |
| Shell injection blocked | Metacharacter test | Blocked |

**All tests are automated** and run on every `npm test` (271 tests across 17 files, including 17 integrity-specific tests) and `npm run verify-integrity` (203-operation hash verification across 34 files).
