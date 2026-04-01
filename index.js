#!/usr/bin/env node
/**
 * fullscope — Code-aware context minification for AI agents.
 * MCP server providing 9 tools for compressed file reads, skeletonization,
 * search, project orientation, and session tracking.
 */

// ─── Demo mode ───
if (process.argv.includes('--demo')) {
  const { runDemo } = await import('./scripts/demo.js');
  await runDemo();
  process.exit(0);
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';

import { applyRecipe, recipeForExt, getExt, adaptRecipe } from './lib/recipes.js';
import { getRecipe } from './lib/builtin-recipes.js';
import { compressJSON } from './lib/json-compress.js';
import { skeletonize } from './lib/skeleton.js';
import { extractImportsExports, formatImportExportHeader } from './lib/imports.js';
import { runSearch, filterSearchResults } from './lib/search.js';
import { findUsages } from './lib/usages.js';
import { generateProjectOverview } from './lib/project.js';
import { verifyLine } from './lib/verify.js';
import { expandFunction } from './lib/expand.js';
import { batchContext } from './lib/batch.js';
import { checkDiffCache, updateDiffCache } from './lib/diff-cache.js';
import { setProjectRoot } from './lib/path-compact.js';
import { addMarkersAfterFilter } from './lib/line-markers.js';
import {
  estimateTokens, savingsHeader, EDIT_SAFETY_FOOTER,
  trackRead, getSessionStats,
} from './lib/tokens.js';

// ─── Helpers ───

function commentPrefix(ext) {
  const hashLangs = new Set(['py', 'pyw', 'pyi', 'rb', 'sh', 'bash', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'tf', 'tfvars', 'hcl']);
  if (hashLangs.has(ext)) return '#';
  if (ext === 'html' || ext === 'htm' || ext === 'xml') return '<!--';
  if (ext === 'css' || ext === 'scss' || ext === 'less') return '/*';
  return '//';
}

function compressFile(filePath, offset, limit, mode) {
  const raw = readFileSync(filePath, 'utf-8');
  const ext = getExt(filePath);
  const recipeName = recipeForExt(ext);
  const baseRecipe = getRecipe(recipeName);

  // JSON preprocessor: compact or schema mode
  let content = raw;
  const jsonMode = mode || baseRecipe._json_mode;
  if (jsonMode && (ext === 'json' || ext === 'jsonc')) {
    content = compressJSON(raw, jsonMode);
  }

  const lines = content.split('\n');
  const start = (offset || 1) - 1;
  const count = limit || lines.length;
  const slice = lines.slice(start, start + count);

  // Adaptive minification based on slice size
  const recipe = adaptRecipe(baseRecipe, slice.length);

  // Apply recipe to raw content (without line numbers) to find which lines survive
  const rawSlice = slice.join('\n');
  const filteredRaw = applyRecipe(rawSlice, recipe);

  // Insert virtual line markers where runs of lines were stripped
  const cp = commentPrefix(ext);
  const withMarkers = addMarkersAfterFilter(rawSlice, filteredRaw, cp);

  // Add original line numbers (preserving real line references).
  // NOTE: Line-number recovery uses text matching against the original slice.
  // This is heuristic — repeated identical lines (e.g. multiple "}" or blank
  // lines) may mis-anchor. Verified correct for all current fixtures and
  // common code patterns. Use fullscope_verify_line to confirm before editing.
  const markedLines = withMarkers.split('\n');
  let rawLineIdx = 0;
  const outputLines = [];
  for (const line of markedLines) {
    if (line.includes('... [') && line.includes('stripped]')) {
      // Marker line — no line number
      outputLines.push('       ' + line);
    } else {
      // Find this line's original position in the slice
      while (rawLineIdx < slice.length && slice[rawLineIdx].trimEnd() !== line.trimEnd()) {
        rawLineIdx++;
      }
      const lineNum = rawLineIdx < slice.length ? start + rawLineIdx + 1 : start + rawLineIdx + 1;
      outputLines.push(`${String(lineNum).padStart(6)} ${line}`);
      rawLineIdx++;
    }
  }
  const numbered = outputLines.join('\n');

  const rawTokens = estimateTokens(rawSlice);
  const filteredTokens = estimateTokens(numbered);
  trackRead(filePath, 'context', rawTokens, filteredTokens);

  const footer = savingsHeader(rawTokens, filteredTokens);
  return numbered + EDIT_SAFETY_FOOTER + '\n' + footer;
}

function skeletonizeFile(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const ext = getExt(filePath);

  // Import/export header
  const ie = extractImportsExports(raw, ext);
  const ieHeader = formatImportExportHeader(ie, commentPrefix(ext));

  // Skeletonize
  let skeleton = skeletonize(raw, ext);
  skeleton = skeleton.replace(/\n{3,}/g, '\n\n');

  // Add line numbers
  const lines = skeleton.split('\n');
  const numbered = lines.map((line, i) => `${String(i + 1).padStart(6)} ${line}`).join('\n');

  const rawTokens = estimateTokens(raw);
  const filteredTokens = estimateTokens(numbered);
  trackRead(filePath, 'skeleton', rawTokens, filteredTokens);

  const footer = savingsHeader(rawTokens, filteredTokens);
  const parts = [];
  if (ieHeader) parts.push(ieHeader);
  parts.push(numbered);
  parts.push(EDIT_SAFETY_FOOTER);
  parts.push(footer);
  return parts.join('\n');
}

// ─── MCP Server ───

const server = new Server(
  { name: 'fullscope', version: '0.1.1' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'fullscope_context',
      description:
        'Compressed file read for CONTEXT ONLY — strips comments, docstrings, types, and whitespace. Typical savings: 10-50% depending on comment density (up to 80% on heavily documented code, as low as 8% on minimal-comment code). Shows virtual line markers where content was stripped. NEVER use for files you plan to edit — comments and formatting are permanently removed from output. Use the built-in Read tool when you need to Edit a file.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the file' },
          offset: { type: 'number', description: 'Start line number (1-based, optional)' },
          limit: { type: 'number', description: 'Number of lines to read (optional)' },
          diff: { type: 'boolean', description: 'Enable diff mode: if file was read before and changed slightly, return a compact diff instead of full re-read' },
          mode: { type: 'string', enum: ['compact', 'schema'], description: 'For JSON files: "schema" returns keys+types only (no values), "compact" is default' },
        },
        required: ['file_path'],
      },
    },
    {
      name: 'fullscope_skeleton',
      description:
        'Ultra-compressed file read showing ONLY function/class/method signatures with IMPORTS and EXPORTS summary — all implementation bodies are replaced with expand handles. Strong on function-heavy code (80-99% savings), weaker on flat data/config files. Use when you need to understand a module API surface without reading implementation details. NEVER use for files you plan to edit. For implementation details, use fullscope_context. For editing, use the built-in Read tool.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the file' },
        },
        required: ['file_path'],
      },
    },
    {
      name: 'fullscope_expand',
      description:
        'Drill into a specific function from a fullscope_skeleton output. Takes a file path + expand handle (e.g. "fn:login" from the skeleton placeholder). Returns just that function body with context-level compression (comments stripped, logic preserved). Use this to progressively disclose detail: start with fullscope_skeleton (cheapest), then fullscope_expand only for functions you care about.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the file' },
          handle: { type: 'string', description: 'Expand handle from skeleton output (e.g. "fn:login")' },
        },
        required: ['file_path', 'handle'],
      },
    },
    {
      name: 'fullscope_search',
      description:
        'Search files with compressed results — runs ripgrep and filters output through fullscope to save tokens. Use instead of Grep/Bash for exploratory searches where you need to scan many results. For precise searches where you need exact line content, use the built-in Grep tool.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for' },
          path: { type: 'string', description: 'Directory or file to search in (defaults to cwd)' },
          glob: { type: 'string', description: 'File pattern filter (e.g. "*.ts", "*.py")' },
          max_results: { type: 'number', description: 'Max lines to return (default 100)' },
        },
        required: ['pattern'],
      },
    },
    {
      name: 'fullscope_usages',
      description:
        'Find where a symbol (function, class, variable) is imported or referenced across the project. Returns results grouped by file. Complements fullscope_skeleton — skeleton shows what a file provides, usages shows where those exports are consumed. Best for: debugging "who calls this?", understanding dependencies.',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Symbol name to find usages of' },
          path: { type: 'string', description: 'Directory to search in (defaults to cwd)' },
          max_results: { type: 'number', description: 'Max matches to return (default 50)' },
        },
        required: ['symbol'],
      },
    },
    {
      name: 'fullscope_batch_context',
      description:
        'Read multiple files in one call, each minified. Saves tool-call overhead. Supports: (1) intent parameter — tell the tool WHY you\'re reading these files and it biases minification to preserve relevant content; (2) token budgeting — files auto-downshift from context to skeleton using information density; (3) cross-file import dedup; (4) dependency-ordered output (leaf deps first as skeleton, importers after with full context).',
      inputSchema: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                file_path: { type: 'string' },
                offset: { type: 'number' },
                limit: { type: 'number' },
                priority: { type: 'string', enum: ['high', 'normal', 'low'], description: 'high = always full context' },
              },
              required: ['file_path'],
            },
            description: 'Array of files to read',
          },
          intent: { type: 'string', description: 'Why you\'re reading these files (e.g. "understand the authentication flow"). Biases compression to preserve relevant content.' },
          max_total_tokens: { type: 'number', description: 'Optional token budget — files auto-downshift to skeleton based on information density' },
        },
        required: ['files'],
      },
    },
    {
      name: 'fullscope_project',
      description:
        'Compressed codebase orientation — returns filtered directory tree, key config files (package.json/Cargo.toml/etc compressed), git status, and detected entry points with their critical-path dependencies. Use this as the first call when exploring a new codebase.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Project root directory (defaults to cwd)' },
        },
      },
    },
    {
      name: 'fullscope_verify_line',
      description:
        'Verify a line number from a compressed view against the raw file. Since compressed output preserves original line numbers via virtual markers, this confirms the line content matches. Returns the raw line with ±5 lines of context. Optionally pass expected_content to verify the match. Use before editing to confirm the exact location.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Path to the file' },
          line: { type: 'number', description: 'Line number from the compressed view' },
          expected_content: { type: 'string', description: 'Optional snippet expected at this line — verifies the match' },
        },
        required: ['file_path', 'line'],
      },
    },
    {
      name: 'fullscope_stats',
      description:
        'Show session savings: total files compressed, tokens saved, estimated cost savings, and context-rot warnings for files read too many times.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // ─── fullscope_context ───
    if (name === 'fullscope_context') {
      // Diff mode (opt-in): on re-read, return diff or "unchanged" if available
      if (args.diff && !args.offset && !args.limit) {
        const cached = checkDiffCache(args.file_path);
        if (cached) {
          trackRead(args.file_path, cached.type === 'unchanged' ? 'cached' : 'diff', 0, 0);
          return { content: [{ type: 'text', text: cached.message }] };
        }
      }
      const result = compressFile(args.file_path, args.offset, args.limit, args.mode);
      // Always store content in diff cache for future diff-mode reads
      try {
        const raw = readFileSync(args.file_path, 'utf-8');
        updateDiffCache(args.file_path, raw);
      } catch {}
      return { content: [{ type: 'text', text: result }] };
    }

    // ─── fullscope_skeleton ───
    if (name === 'fullscope_skeleton') {
      const result = skeletonizeFile(args.file_path);
      return { content: [{ type: 'text', text: result }] };
    }

    // ─── fullscope_expand ───
    if (name === 'fullscope_expand') {
      const result = expandFunction(args.file_path, args.handle);
      return { content: [{ type: 'text', text: result }] };
    }

    // ─── fullscope_search ───
    if (name === 'fullscope_search') {
      if (args.path) setProjectRoot(args.path);
      const raw = runSearch(args.pattern, args.path, args.glob, args.max_results);
      if (!raw || raw.trim() === '') {
        return { content: [{ type: 'text', text: 'No matches found.' }] };
      }
      const filtered = filterSearchResults(raw);
      const rawTokens = estimateTokens(raw);
      const filteredTokens = estimateTokens(filtered);
      const footer = savingsHeader(rawTokens, filteredTokens);
      return { content: [{ type: 'text', text: filtered + '\n' + footer }] };
    }

    // ─── fullscope_usages ───
    if (name === 'fullscope_usages') {
      if (args.path) setProjectRoot(args.path);
      const result = findUsages(args.symbol, args.path, args.max_results);
      return { content: [{ type: 'text', text: result }] };
    }

    // ─── fullscope_batch_context ───
    if (name === 'fullscope_batch_context') {
      const result = batchContext(args.files || [], {
        max_total_tokens: args.max_total_tokens,
        intent: args.intent,
      });
      return { content: [{ type: 'text', text: result.text }] };
    }

    // ─── fullscope_project ───
    if (name === 'fullscope_project') {
      const projectDir = args.path || process.cwd();
      setProjectRoot(projectDir);
      const result = generateProjectOverview(projectDir);
      const rawTokens = estimateTokens(result);
      trackRead(projectDir, 'project', rawTokens, rawTokens);
      return { content: [{ type: 'text', text: result }] };
    }

    // ─── fullscope_verify_line ───
    if (name === 'fullscope_verify_line') {
      const result = verifyLine(args.file_path, args.line, args.expected_content);
      return { content: [{ type: 'text', text: result }] };
    }

    // ─── fullscope_stats ───
    if (name === 'fullscope_stats') {
      const result = getSessionStats();
      return { content: [{ type: 'text', text: result }] };
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
