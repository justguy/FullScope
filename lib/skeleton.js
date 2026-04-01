// Skeletonization: collapse function/class bodies to placeholders.
// Tier 1 languages: JS/TS (esbuild), Python (ast), C-family (brace-counting)

import { execSync } from 'child_process';

// ─── Signature detection ───

// Control-flow keywords that should NOT be treated as signatures
const CONTROL_FLOW = /^\s*(if|else|for|while|do|switch|case|try|catch|finally|with|throw|return)\b/;

const SIG_PATTERNS = [
  // JS/TS
  /^(export\s+)?(default\s+)?(async\s+)?(function|class)\s/,
  /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/,
  /^\s*\w+\.\w+\s*=\s*(async\s+)?function[\s(]/,   // res.send = function send() {  OR  res.get = function() {
  /^\s*(module\.)?exports\.\w+\s*=\s*(async\s+)?function[\s(]/,  // exports.foo = function() {
  /^\s*(get|set)\s+\w+/,
  /^\s*(public|private|protected|static|abstract|async|override)\s/,
  // Rust
  /^\s*(pub\s+)?(fn|struct|enum|impl|trait|mod|type)\s/,
  /^\s*(pub\s+)?(async\s+)?fn\s/,
  // Go
  /^\s*func\s/,
  /^\s*type\s+\w+\s+(struct|interface)\s/,
  // Java/C#
  /^\s*(public|private|protected|internal)\s+.*(class|interface|enum|record|struct)\s/,
  /^\s*(public|private|protected|internal|static|abstract|final|virtual|override|sealed)\s+.*[\w>]\s+\w+\s*\(/,
  // C/C++
  /^\s*(template|namespace)\s/,
];

export function isSignatureLine(line) {
  const trimmed = line.trim();
  if (CONTROL_FLOW.test(trimmed)) return false;
  return SIG_PATTERNS.some(re => re.test(trimmed));
}

// ─── Brace-counting collapse ───

// Detect if a signature is a class/impl/struct (container that holds methods)
function isClassLike(line) {
  return /\b(class|interface|impl|struct)\b/.test(line) && !/\bnew\b/.test(line);
}

// Detect method signatures inside a class/impl body
function isMethodSignature(line) {
  const trimmed = line.trim();
  if (CONTROL_FLOW.test(trimmed)) return false;
  // JS/TS methods: name(args) {  /  async name(args) {  /  get name() {
  if (/^\s*(?:public|private|protected|static|abstract|async|override|readonly|get|set)\s/.test(trimmed) && trimmed.endsWith('{')) return true;
  if (/^\s*(?:async\s+)?\w+\s*\(/.test(trimmed) && trimmed.endsWith('{')) return true;
  // Rust: pub fn name(  /  fn name(
  if (/^\s*(?:pub\s+)?(?:async\s+)?fn\s/.test(trimmed) && trimmed.endsWith('{')) return true;
  // Property-assigned: this.x = function(
  if (/^\s*this\.\w+\s*=\s*(?:async\s+)?function[\s(]/.test(trimmed) && trimmed.endsWith('{')) return true;
  return false;
}

export function collapseBlocks(code) {
  const lines = code.split('\n');
  const result = [];
  let depth = 0;
  let inBlock = false;
  let inClassBody = false;
  let classDepth = 0;
  let blockStartLineIdx = 0;
  let blockName = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (inClassBody && !inBlock) {
      // Inside a class body — look for method signatures to collapse
      // Track class depth
      for (const ch of trimmed) {
        if (ch === '{') classDepth++;
        else if (ch === '}') classDepth--;
      }

      if (classDepth <= 0) {
        // Class closed
        result.push(line);
        inClassBody = false;
        classDepth = 0;
        continue;
      }

      // Check if this line is a method signature
      if (trimmed.endsWith('{') && isMethodSignature(trimmed)) {
        result.push(line);
        inBlock = true;
        depth = 1;
        blockStartLineIdx = i;
        blockName = extractFunctionName(trimmed);
        // Undo the class depth count for this opening brace (method tracks its own)
        classDepth--;
      } else {
        result.push(line);
      }
    } else if (!inBlock) {
      result.push(line);
      if (trimmed.endsWith('{') && isSignatureLine(trimmed)) {
        if (isClassLike(trimmed)) {
          // Enter class body — don't collapse, show method signatures
          inClassBody = true;
          classDepth = 1;
        } else {
          // Regular function — collapse entire body
          inBlock = true;
          depth = 1;
          blockStartLineIdx = i;
          blockName = extractFunctionName(trimmed);
        }
      }
    } else {
      // Inside a collapsed block (function/method body)
      for (const ch of trimmed) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (depth <= 0) {
        const bodyLines = i - blockStartLineIdx;
        const handle = blockName ? ` — expand: fn:${blockName}` : '';
        result[result.length - 1] = lines[blockStartLineIdx].replace(
          /\{[^}]*$/,
          `{ /* ${bodyLines} lines${handle} */ }`
        );
        inBlock = false;
        depth = 0;
      }
    }
  }
  return result.join('\n');
}

// Extract function/method name from a signature line
function extractFunctionName(line) {
  // X.Y = function name(  /  exports.foo = function foo(
  let m = line.match(/\.\w+\s*=\s*(?:async\s+)?function\s+(\w+)/);
  if (m) return m[1];
  // X.Y = function(  — anonymous, use property name
  m = line.match(/\.(\w+)\s*=\s*(?:async\s+)?function\s*\(/);
  if (m) return m[1];
  // async function foo(  /  function foo(  /  fn foo(
  m = line.match(/(?:async\s+)?(?:function|fn)\s+(\w+)/);
  if (m) return m[1];
  // class Foo {
  m = line.match(/class\s+(\w+)/);
  if (m) return m[1];
  // const foo = (  /  const foo = async (
  m = line.match(/(?:const|let|var)\s+(\w+)\s*=/);
  if (m) return m[1];
  // public void foo(  /  private static int bar(
  m = line.match(/(?:public|private|protected|internal|static|abstract|virtual|override|async|final|sealed)\s+.*?\s+(\w+)\s*\(/);
  if (m) return m[1];
  // method(args) {  (standalone methods in classes)
  m = line.match(/^\s*(?:get\s+|set\s+|async\s+)?(\w+)\s*\(/);
  if (m) return m[1];
  // type Foo struct {  /  func (r *R) Foo(
  m = line.match(/(?:type|func)\s+(?:\([^)]*\)\s+)?(\w+)/);
  if (m) return m[1];
  // impl Foo {  /  trait Foo {  /  enum Foo {  /  struct Foo {
  m = line.match(/(?:impl|trait|enum|struct|mod)\s+(\w+)/);
  if (m) return m[1];
  return '';
}

// ─── JS/TS skeletonization ───

let esbuild = null;
try {
  esbuild = await import('esbuild');
} catch {
  // esbuild not installed — TS type-stripping skipped
}

function stripTypes(code, ext) {
  if (!['ts', 'tsx', 'mts', 'cts'].includes(ext)) return code;
  if (!esbuild) return code;
  try {
    const loader = (ext === 'tsx') ? 'tsx' : 'ts';
    const result = esbuild.transformSync(code, {
      loader,
      minifyWhitespace: false,
      minifyIdentifiers: false,
      minifySyntax: false,
    });
    return result.code;
  } catch {
    return code;
  }
}

function skeletonizeJS(code) {
  // Strip block comments
  let result = code.replace(/\/\*[\s\S]*?\*\//g, '');
  // Strip single-line comments
  result = result.replace(/^\s*\/\/.*$/gm, '');
  return collapseBlocks(result);
}

// ─── Python skeletonization ───

function skeletonizePython(code) {
  try {
    const pyScript = `
import ast, sys

code = sys.stdin.read()
try:
    tree = ast.parse(code)
except:
    print(code)
    sys.exit(0)

lines = code.split('\\n')
skips = set()
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.body:
            body_start = node.body[0].lineno
            body_end = node.body[-1].end_lineno or node.body[-1].lineno
            for i in range(body_start, body_end + 1):
                skips.add(i)

out = []
prev_was_sig = False
for i, line in enumerate(lines):
    lineno = i + 1
    if lineno in skips:
        if prev_was_sig:
            indent = len(line) - len(line.lstrip())
            body_len = body_end_line - body_start_line + 1
            fn_name = sig_name or ''
            handle = f' — expand: fn:{fn_name}' if fn_name else ''
            out.append(' ' * indent + f'pass  # {body_len} lines{handle}')
            prev_was_sig = False
        continue
    out.append(line)
    stripped = line.strip()
    is_sig = stripped.endswith(':') and (
        stripped.startswith('def ') or
        stripped.startswith('async def ') or
        stripped.startswith('class ') or
        '@' in stripped
    )
    if is_sig:
        prev_was_sig = True
        # Extract name
        import re
        nm = re.match(r'(?:async\\s+)?(?:def|class)\\s+(\\w+)', stripped)
        sig_name = nm.group(1) if nm else ''
        # Find this node's body range
        body_start_line = 0
        body_end_line = 0
        for nd in ast.walk(tree):
            if isinstance(nd, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                if nd.lineno == lineno and nd.body:
                    body_start_line = nd.body[0].lineno
                    body_end_line = nd.body[-1].end_lineno or nd.body[-1].lineno
                    break
    else:
        prev_was_sig = False

print('\\n'.join(out))
`;
    const result = execSync(`python3 -c ${JSON.stringify(pyScript)}`, {
      input: code,
      timeout: 5000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result;
  } catch {
    // Fallback: regex-based indent-level collapse
    return collapseBlocksPython(code);
  }
}

// Regex fallback for Python when python3 isn't available
function collapseBlocksPython(code) {
  const lines = code.split('\n');
  const result = [];
  let inBody = false;
  let sigIndent = 0;
  let bodyLineCount = 0;
  let fnName = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();
    const indent = line.length - line.trimStart().length;

    if (inBody) {
      if (indent <= sigIndent && stripped !== '') {
        inBody = false;
        // Update the placeholder with actual line count
        const lastIdx = result.length - 1;
        const handle = fnName ? ` — expand: fn:${fnName}` : '';
        result[lastIdx] = ' '.repeat(sigIndent + 4) + `pass  # ${bodyLineCount} lines${handle}`;
      } else {
        bodyLineCount++;
        continue;
      }
    }

    if (!inBody) {
      result.push(line);
      if (stripped.endsWith(':') && (stripped.startsWith('def ') || stripped.startsWith('async def ') || stripped.startsWith('class '))) {
        inBody = true;
        sigIndent = indent;
        bodyLineCount = 0;
        const m = stripped.match(/(?:async\s+)?(?:def|class)\s+(\w+)/);
        fnName = m ? m[1] : '';
        result.push(''); // placeholder, will be replaced
      }
    }
  }

  // Handle case where body extends to end of file
  if (inBody) {
    const lastIdx = result.length - 1;
    const handle = fnName ? ` — expand: fn:${fnName}` : '';
    result[lastIdx] = ' '.repeat(sigIndent + 4) + `pass  # ${bodyLineCount} lines${handle}`;
  }

  return result.join('\n');
}

// ─── Main router ───

const JS_EXTS = new Set(['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts']);
const PY_EXTS = new Set(['py', 'pyw', 'pyi']);

export function skeletonize(code, ext) {
  if (JS_EXTS.has(ext)) {
    const stripped = stripTypes(code, ext);
    return skeletonizeJS(stripped);
  }
  if (PY_EXTS.has(ext)) {
    return skeletonizePython(code);
  }
  // Rust, Go, Java, C#, C/C++ — generic brace-collapsing
  return collapseBlocks(code);
}
