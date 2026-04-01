// Built-in language recipes — no external TOML files needed.
// Each recipe follows the 8-step pipeline schema from recipes.js.

export const recipes = {
  // ─── Tier 1: Full recipe + skeleton ───

  'code-js': {
    strip_ansi: true,
    remove_lines: [
      '^\\s*\\/\\/',                     // ALL single-line comments
      '^\\s*\\*\\s',                     // JSDoc continuation lines
      '^\\s*\\*$',                       // JSDoc empty lines
      '^\\s*\\/\\*\\*',                  // JSDoc open
      '^\\s*\\*\\/',                     // block comment close
      '^\\s*console\\.',                 // console.log/warn/error
      '^\\s*\\/\\*\\s*eslint',           // eslint block directives
      '^\\s*\\"use strict\\"',           // "use strict"
      "^\\s*\\'use strict\\'",           // 'use strict'
      '^\\s*$',                          // blank lines
    ],
    multiline_replace: [
      ['\\/\\*[\\s\\S]*?\\*\\/', ''],    // block comments
    ],
    replace: [
      ['\\s*\\/\\/.*$', ''],             // trailing comments
      ['\\s+$', ''],                      // trailing whitespace
    ],
    remove_blank_lines: true,
    on_empty: '// [empty after compression]',
  },

  'code-py': {
    strip_ansi: true,
    remove_lines: [
      '^\\s*#(?!\\!)',                   // comments (not shebangs)
      '^\\s*print\\(',                   // print statements
      '^\\s*logger\\.',                  // logger calls
      '^\\s*logging\\.',                 // logging calls
      '^\\s*assert\\s',                  // assert statements
      '^\\s*# type:',                    // type comments
      '^\\s*# noqa',                     // noqa directives
      '^\\s*# pylint',                   // pylint directives
      '^\\s*# fmt:',                     // formatter directives
      '^\\s*# TODO',                     // TODO
      '^\\s*# FIXME',                    // FIXME
    ],
    multiline_replace: [
      ['"""[\\s\\S]*?"""', ''],          // triple-double docstrings
      ["'''[\\s\\S]*?'''", ''],          // triple-single docstrings
    ],
    replace: [
      [':\\s*[A-Z][A-Za-z\\[\\], |]*\\s*=', ' ='],     // type hints on assignment
      ['\\)\\s*->\\s*[A-Za-z\\[\\], |.]*:', '):'],      // return type hints
    ],
    remove_blank_lines: true,
    on_empty: '# [empty after compression]',
  },

  'code-rs': {
    strip_ansi: true,
    remove_lines: [
      '^\\s*\\/\\/\\/',                 // doc comments
      '^\\s*\\/\\/!',                   // inner doc comments
      '^\\s*\\/\\/',                    // line comments
      '^\\s*#\\[(?:cfg_attr|allow|warn|deny|forbid)',  // common attributes
      '^\\s*#!\\[',                     // inner attributes
      '^\\s*$',                         // blank lines
    ],
    multiline_replace: [
      ['\\/\\*[\\s\\S]*?\\*\\/', ''],   // block comments
    ],
    replace: [
      ['\\s*\\/\\/.*$', ''],            // trailing comments
      ['\\s+$', ''],                     // trailing whitespace
    ],
    remove_blank_lines: true,
    on_empty: '// [empty after compression]',
  },

  'code-go': {
    strip_ansi: true,
    remove_lines: [
      '^\\s*\\/\\/',                    // line comments
      '^\\s*$',                         // blank lines
    ],
    multiline_replace: [
      ['\\/\\*[\\s\\S]*?\\*\\/', ''],   // block comments
    ],
    replace: [
      ['\\s*\\/\\/.*$', ''],            // trailing comments
    ],
    remove_blank_lines: true,
    on_empty: '// [empty after compression]',
  },

  'code-java': {
    strip_ansi: true,
    remove_lines: [
      '^\\s*\\/\\/',                    // line comments
      '^\\s*\\*\\s',                    // Javadoc continuation
      '^\\s*\\/\\*\\*',                 // Javadoc open
      '^\\s*\\*\\/',                    // block close
      '^\\s*@Override',                 // @Override (noise for understanding)
      '^\\s*@SuppressWarnings',         // @SuppressWarnings
      '^\\s*System\\.out\\.print',      // System.out.println
    ],
    multiline_replace: [
      ['\\/\\*[\\s\\S]*?\\*\\/', ''],   // block/Javadoc comments
    ],
    remove_blank_lines: true,
    on_empty: '// [empty after compression]',
  },

  'code-cs': {
    strip_ansi: true,
    remove_lines: [
      '^\\s*\\/\\/\\/',                 // XML doc comments
      '^\\s*\\/\\/',                    // line comments
      '^\\s*#region',                   // #region
      '^\\s*#endregion',                // #endregion
      '^\\s*#pragma',                   // #pragma
      '^\\s*\\[Obsolete',              // [Obsolete]
      '^\\s*Console\\.Write',           // Console.WriteLine
    ],
    multiline_replace: [
      ['\\/\\*[\\s\\S]*?\\*\\/', ''],   // block comments
    ],
    remove_blank_lines: true,
    on_empty: '// [empty after compression]',
  },

  'code-c': {
    strip_ansi: true,
    remove_lines: [
      '^\\s*\\/\\/',                    // line comments
      '^\\s*#include\\s*<',            // system includes (keep local includes)
      '^\\s*#pragma\\s+once',           // pragma once
    ],
    multiline_replace: [
      ['\\/\\*[\\s\\S]*?\\*\\/', ''],   // block comments
    ],
    remove_blank_lines: true,
    on_empty: '// [empty after compression]',
  },

  // ─── Tier 2: Recipe only ───

  'code-rb': {
    strip_ansi: true,
    remove_lines: [
      '^\\s*#(?!\\!)',                   // comments (not shebangs)
    ],
    multiline_replace: [
      ['=begin[\\s\\S]*?=end', ''],     // multi-line comments
    ],
    remove_blank_lines: true,
    on_empty: '# [empty after compression]',
  },

  'code-php': {
    strip_ansi: true,
    remove_lines: [
      '^\\s*\\/\\/',                    // line comments
      '^\\s*#',                         // hash comments
      '^\\s*\\*\\s',                    // PHPDoc continuation
      '^\\s*\\/\\*\\*',                 // PHPDoc open
      '^\\s*\\*\\/',                    // block close
    ],
    multiline_replace: [
      ['\\/\\*[\\s\\S]*?\\*\\/', ''],   // block comments
    ],
    remove_blank_lines: true,
    on_empty: '// [empty after compression]',
  },

  'code-swift': {
    strip_ansi: true,
    remove_lines: [
      '^\\s*\\/\\/\\/',                 // doc comments
      '^\\s*\\/\\/',                    // line comments
    ],
    multiline_replace: [
      ['\\/\\*[\\s\\S]*?\\*\\/', ''],   // block comments
    ],
    remove_blank_lines: true,
    on_empty: '// [empty after compression]',
  },

  'code-kt': {
    strip_ansi: true,
    remove_lines: [
      '^\\s*\\/\\/',                    // line comments
      '^\\s*\\*\\s',                    // KDoc continuation
      '^\\s*\\/\\*\\*',                 // KDoc open
      '^\\s*\\*\\/',                    // block close
    ],
    multiline_replace: [
      ['\\/\\*[\\s\\S]*?\\*\\/', ''],   // block comments
    ],
    remove_blank_lines: true,
    on_empty: '// [empty after compression]',
  },

  'code-scala': {
    strip_ansi: true,
    remove_lines: [
      '^\\s*\\/\\/',                    // line comments
      '^\\s*\\*\\s',                    // ScalaDoc continuation
      '^\\s*\\/\\*\\*',                 // ScalaDoc open
      '^\\s*\\*\\/',                    // block close
    ],
    multiline_replace: [
      ['\\/\\*[\\s\\S]*?\\*\\/', ''],   // block comments
    ],
    remove_blank_lines: true,
    on_empty: '// [empty after compression]',
  },

  'code-hcl': {
    strip_ansi: true,
    remove_lines: [
      '^\\s*#',                         // hash comments
      '^\\s*\\/\\/',                    // line comments
      '^\\s*description\\s*=',          // verbose description fields
    ],
    multiline_replace: [
      ['\\/\\*[\\s\\S]*?\\*\\/', ''],   // block comments
    ],
    remove_blank_lines: true,
    on_empty: '# [empty after compression]',
  },

  'code-css': {
    strip_ansi: true,
    multiline_replace: [
      ['\\/\\*[\\s\\S]*?\\*\\/', ''],   // block comments
    ],
    replace: [
      ['\\s{2,}', ' '],                 // collapse whitespace
    ],
    remove_blank_lines: true,
    on_empty: '/* [empty after compression] */',
  },

  // ─── Tier 3: Docs + generic ───

  'doc': {
    strip_ansi: true,
    remove_lines: [
      '^\\s*$',                         // blank lines (aggressive for docs)
    ],
    replace: [
      ['^(\\s*)[-*]\\s{2,}', '$1- '],   // normalize list indentation
    ],
    remove_blank_lines: true,
  },

  'doc-xml': {
    strip_ansi: true,
    multiline_replace: [
      ['<!--[\\s\\S]*?-->', ''],        // XML comments
    ],
    remove_blank_lines: true,
  },

  // JSON/JSONC — handled by json-compress.js preprocessor, recipe just cleans up
  'json-compact': {
    strip_ansi: true,
    remove_blank_lines: true,
    _json_mode: 'compact',             // signals preprocessor
  },

  // Log/text/CSV — improved fallback with dedup and error extraction
  'log': {
    strip_ansi: true,
    remove_lines: [
      '^\\s*$',                         // blank lines
      '^\\s*\\d{4}[-/]\\d{2}[-/]\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}.*\\b(DEBUG|TRACE|VERBOSE)\\b',  // debug/trace log lines
    ],
    replace: [
      ['^\\d{4}[-/]\\d{2}[-/]\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}[.,]?\\d*\\s*', ''],  // strip timestamp prefixes
    ],
    dedup_lines: 3,                     // collapse 3+ consecutive similar lines
    remove_blank_lines: true,
    max_lines: 200,
    lines_from: 'both',
  },

  'code-generic': {
    strip_ansi: true,
    remove_lines: [
      '^\\s*\\/\\/',                    // C-style line comments
      '^\\s*#(?!\\!|include|define|if|else|endif|pragma)',  // hash comments (not preprocessor)
    ],
    multiline_replace: [
      ['\\/\\*[\\s\\S]*?\\*\\/', ''],   // block comments
    ],
    remove_blank_lines: true,
    on_empty: '// [empty after compression]',
  },
};

export function getRecipe(name) {
  return recipes[name] || recipes['code-generic'];
}
