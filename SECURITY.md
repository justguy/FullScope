# Security

## Design Guarantees

fullscope is a **read-only** tool. It is designed to compress code for AI agent consumption and will never:

- Modify, write, patch, or delete any file on disk
- Execute user code or project code in any form
- Send data to any remote server, API, or external service
- Use any secondary LLM, embedding model, or AI service
- Store persistent data outside of in-memory session state

All processing is deterministic, local, and stateless across sessions.

## Search Safety

File search (`fullscope_search`, `fullscope_usages`) uses `execFileSync` with argument arrays to prevent shell injection. User-supplied patterns, paths, and globs are never interpolated into shell command strings.

Search paths are validated to prevent overly broad filesystem traversal.

## Compression Safety

- Compressed output is clearly labeled with a footer warning against using it for editing
- Virtual line markers preserve original line numbers so compressed references stay anchored to the raw file
- If any minification step fails, the raw content is returned unchanged (fallback safety)
- The `fullscope_verify_line` tool allows explicit verification of line content before editing

## Session State

- In-memory only: diff cache, session stats, and read tracking exist only for the lifetime of the server process
- No data is persisted to disk
- Diff cache is opt-in (`diff: true` parameter) and capped at 100 entries

## Reporting Vulnerabilities

If you find a security issue, please open a GitHub issue at:
https://github.com/justguy/fullscope/issues

For sensitive reports, contact the maintainer directly.
