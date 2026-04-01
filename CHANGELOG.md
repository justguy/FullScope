# Changelog

## 0.1.1 (2026-03-31)

Beta packaging and release-alignment update.

- Publish the documented demo entrypoint (`scripts/demo.js`) in the npm tarball
- Publish linked docs and examples referenced from the README
- Keep large README images hosted remotely instead of shipping them in the npm tarball
- Align MCP server metadata with the package version (`0.1.1`)
- Refresh release references from `0.1.0` to `0.1.1`

## 0.1.0 (2026-03-29)

Initial release. **See more code. Get better answers.**

### Tools (9)

- **fullscope_project** -- Codebase orientation with .gitignore-aware tree, entry point detection, config compression
- **fullscope_skeleton** -- Signatures-only view with expand handles (strong on function-heavy code, weaker on data/config)
- **fullscope_expand** -- Per-function drill-down from skeleton handles
- **fullscope_context** -- Compressed file read with virtual line markers (savings vary by comment density: 1-99%)
- **fullscope_batch_context** -- Multi-file read with intent-aware filtering, budget allocation, cross-file dedup
- **fullscope_search** -- Compressed grep via ripgrep (injection-safe argument arrays)
- **fullscope_usages** -- Symbol usage finder with per-language import pattern matching
- **fullscope_verify_line** -- Line content verification with optional expected_content matching
- **fullscope_stats** -- Session savings tracker with context-rot detection

### Language Support

- **Tier 1** (recipe + skeleton): JavaScript, TypeScript, Python, Rust, Go, Java, C#, C/C++
- **Tier 2** (recipe only): Ruby, PHP, Swift, Kotlin, Scala, HCL/Terraform
- **Tier 3** (docs + data): Markdown, JSON (compact + schema modes), YAML, TOML, HTML, CSS, XML, log files

### Compression Features

- 9-step filter pipeline with virtual line markers
- Adaptive compression tiers by file size (<50 / 50-500 / >500 lines)
- JSON-aware compression (compact mode, schema mode)
- Log file dedup (consecutive similar lines collapsed)
- Path compaction (project root stripped from output)
- Diff cache (opt-in via `diff: true`, in-memory LRU, 100 entries)

### Benchmarks

- 30 files, 30,830 lines across 5 open-source projects (Express, FastAPI, Kubernetes, Ripgrep, python-projects) + 16 bundled fixtures
- Combined: 42% context savings, 62% skeleton savings
- 5 task-level benchmarks, all passing (avg 76% savings)
- All benchmarks run on unedited upstream code

### Safety & Integrity

- Read-only design: zero file modifications across 203 operations on 34 files (SHA-256 verified)
- Search uses `execFileSync` with argument arrays (injection-safe)
- Line-number recovery is heuristic (verified for common patterns; `fullscope_verify_line` recommended before editing)
- 271 tests across 17 test files

### Known Limitations

- Skeletonization uses heuristic brace-counting for C-family languages (tree-sitter planned)
- Intent filtering is keyword-based, not semantic
- Diff cache is session-local (in-memory only)
- Python skeletonization requires `python3` on PATH for best results (regex fallback available)
- Compressed views are for reading/understanding only, not for editing
- Line-number recovery may mis-anchor on files with many repeated identical lines
