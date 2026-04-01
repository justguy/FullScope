# How fullscope Compares to Other Context Optimization Approaches

## The Problem

AI agents waste 50-80% of their context window on content the LLM doesn't need: comments, type annotations, docstrings, whitespace, ANSI color codes, and boilerplate. On a typical coding session reading 30 files, this means 40,000+ wasted tokens — roughly $0.60 per session, and more critically, earlier context compaction that loses important state.

## Three Approaches

### 1. Raw file reads (the default)

Every AI coding tool starts here: `read_file` returns the complete file.

- **Tokens consumed**: 100%
- **Logic visibility**: Complete — the LLM sees everything
- **When it's right**: When you're about to edit a file (you need exact content for search/replace)
- **When it's wasteful**: When you're exploring, reviewing architecture, or scanning for patterns

### 2. Execution sandboxes

Tools in this category run code in isolated subprocesses and return only stdout or metadata. The raw file content never enters the context window.

- **Tokens consumed**: ~2% (metadata, summaries, execution output)
- **Logic visibility**: None — the LLM never sees the source code
- **When it's right**: Running tests, processing data, executing API calls
- **When it's wrong**: Understanding code, reviewing logic, debugging, architecture review

### 3. Code-aware compression (fullscope)

Strip what the LLM doesn't need. Keep what it does. The LLM sees real, readable code — just less of it.

- **Tokens consumed**: 10-40% (context mode), 3-25% (skeleton mode)
- **Logic visibility**: Complete — all logic, structure, and signatures preserved
- **When it's right**: Exploring codebases, understanding architecture, reviewing implementation
- **When it's wrong**: When you need to edit (use raw read instead)

## Detailed Comparison

| Feature | Raw Read | Execution Sandbox | **fullscope** |
|---------|----------|-------------------|-------------------|
| Token cost | 100% | ~2% | 10-40% |
| Sees source code | Yes | No | Yes |
| Sees function bodies | Yes | No | Context: Yes, Skeleton: No |
| Sees comments | Yes | No | No (stripped) |
| Safe for editing | Yes | N/A | No (use raw read) |
| Session state recovery | No | Yes (FTS5 indexing) | Partial (context-rot detection) |
| Language awareness | No | Execution only | Recipe + AST-level skeleton |
| Dynamic fidelity | No | No | Yes (skeleton ↔ context ↔ budget mode) |
| Multi-file batching | No | Yes | Yes (with budget mode) |
| Import/export mapping | No | No | Yes |
| Entry point detection | No | No | Yes |
| Dependencies | None | Node + SQLite | Node only (esbuild optional) |

## The Innovation: Dynamic Fidelity

Most context optimization tools are preprocessors — they run once before the prompt. fullscope is different: it's a **dynamic MCP toolset** that lets the LLM choose its minification level mid-conversation.

The agent starts with `fullscope_project` (cheap orientation), zooms into `fullscope_skeleton` (API surface), then selectively reads `fullscope_context` (full logic) only for the files that matter. If the token budget runs low, `fullscope_batch_context` auto-downshifts from context to skeleton for lower-priority files.

This "progressive disclosure" of code detail is the key differentiator.

## When to Use What

| Task | Best approach |
|------|---------------|
| Explore unfamiliar codebase | `fullscope_project` → `fullscope_skeleton` → `fullscope_context` |
| Understand a module's API | `fullscope_skeleton` |
| Review implementation logic | `fullscope_context` |
| Run tests / execute code | Execution sandbox |
| Edit a file | Built-in `read_file` (full fidelity) |
| Search for patterns | `fullscope_search` (exploratory) or built-in grep (precise) |
| Find who uses a function | `fullscope_usages` |
| Verify line before editing | `fullscope_verify_line` → `read_file` → `edit` |

## Real Numbers

Measured on 30 files (30,830 lines) across 5 open-source projects (Express, FastAPI, Kubernetes, Ripgrep, python-projects) and 16 bundled fixtures:

- **Context mode**: 1-99% savings depending on comment density (42% average across 30 benchmarked files)
- **Skeleton mode**: 0-99% depending on code structure (75% average; strong on function-heavy code, minimal on flat data files)

On heavily documented codebases (FastAPI docstrings, Express JSDoc), context mode reaches 68-99% savings. On minimal-comment code (Rust, Go), context savings are 4-56%.

## Complementary, Not Competing

These approaches serve different phases of the development workflow:

1. **Orient** → `fullscope_project` (codebase overview, entry points)
2. **Map** → `fullscope_skeleton` (API surfaces, module structure)
3. **Understand** → `fullscope_context` (implementation logic, minus noise)
4. **Execute** → Sandbox tools (test results, data processing)
5. **Edit** → `read_file` (full fidelity for search/replace)

A well-configured agent uses all three approaches. fullscope handles steps 1-3 efficiently, leaving the full token budget for the critical edit phase.
