---
name: Bug Report
about: Create a report to help us improve fullscope
title: '[BUG] '
labels: bug
assignees: ''
---

**Describe the bug**
A clear and concise description of what the bug is.

**Which tool failed?**
- [ ] `fullscope_project`
- [ ] `fullscope_skeleton`
- [ ] `fullscope_expand`
- [ ] `fullscope_context` / `fullscope_batch_context`
- [ ] `fullscope_search` / `fullscope_usages`
- [ ] `fullscope_verify_line`
- [ ] Other / Setup

**To Reproduce**
Steps to reproduce the behavior:
1. Client used (e.g., Cursor, Claude Code, Gemini CLI)
2. Tool called with arguments (e.g., `fullscope_expand`, handle: `fn:login`)
3. See error or unexpected output

**Expected behavior**
A clear and concise description of what you expected to happen (e.g., "Expected lines 12-40 to be returned, but got an out-of-bounds error").

**Code Snippet & Language (Crucial)**
If a specific file failed to compress or skeletonize properly, please provide a minimal reproducible snippet of the code.
*Note: Please obfuscate or remove any proprietary/sensitive logic. We just need the structure.*

```
// Example:
class BrokenClass {
  // ...
}
```

**Environment**
- Node.js version: [e.g., v20.11.0]
- OS: [e.g., macOS 14.2, Ubuntu 22.04]
- ripgrep installed: [yes/no]
- python3 installed: [yes/no]

**Additional context**
Add any other context about the problem here (e.g., file size, language, error messages).
