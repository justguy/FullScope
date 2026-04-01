# Contributing to fullscope

First off, thank you for considering contributing to fullscope!

fullscope is built on a foundation of absolute trust. Because this tool sits between AI agents and user source code, our primary goal is maintaining strict read-only guarantees while maximizing context minification.

This document outlines the process for contributing, testing your changes, and ensuring our core guarantees remain intact.

---

## Core Principles

Before writing any code, please understand fullscope's non-negotiable design constraints:

- **Strictly Read-Only**: fullscope must never write, modify, or delete files.
- **Zero External Calls**: fullscope must never send data to external APIs, telemetry services, or secondary LLMs.
- **Fail-Safe**: If minification fails or encounters an unknown file type, the system must gracefully fall back to returning the raw, uncompressed file content.
- **Deterministic**: Given the same file and the same mode, the output should always be identical.

Contributions that violate these principles will not be accepted.

---

## Local Development Setup

Fork the repository and clone your fork:

```bash
git clone https://github.com/YOUR_USERNAME/fullscope.git
cd fullscope
```

Install dependencies:

```bash
npm install
```

Create a branch for your feature or bug fix:

```bash
git checkout -b feature/my-new-feature
```

---

## The Verification Pipeline (Required)

Because we guarantee zero byte-level modifications and track minification savings meticulously, you must run our verification suite before submitting a Pull Request.

Please ensure all of the following pass on your machine:

```bash
# 1. Run the standard test suite
npm test

# 2. Verify zero byte-level changes (SHA-256 checks across all operations)
npm run verify-integrity

# 3. Verify file-level minification savings haven't regressed
npm run benchmark

# 4. Verify agent task-level savings haven't regressed
npm run task-benchmark
```

**Note**: If your changes legitimately alter benchmark results or integrity hashes (e.g., adding a new test fixture or improving a minification recipe), please include the updated `data/benchmarks.json` or `data/integrity-results.json` files in your commit.

---

## How to Contribute

### Adding or Improving Language Support (Recipes)

We are always looking to upgrade Tier 2 languages (recipe only) to Tier 1 (recipe + skeleton), or add entirely new languages.

1. Add a representative source file to `test/fixtures/`.
2. Update the language detection mapping and create your recipe/skeleton logic.
3. Add the new fixture to the `docs/TEST_MATRIX.md` documentation.
4. Run `npm test` and `npm run verify-integrity` to ensure your new fixture doesn't break the read-only pipeline.

### Bug Fixes & Features

1. Add a test case that reproduces the bug or validates the new feature.
2. Implement your fix.
3. Run the full verification pipeline.

---

## Submitting a Pull Request

When you are ready to submit your PR:

1. Push your branch to your fork.
2. Open a Pull Request against the `main` branch of the `justguy/fullscope` repository.
3. In your PR description, please include:
   - A summary of the changes.
   - Confirmation that `npm run verify-integrity` passes.
   - If applicable, the before/after minification percentages from `npm run benchmark`.

We review PRs focusing on safety, performance (token savings vs. fidelity), and adherence to the read-only philosophy.
