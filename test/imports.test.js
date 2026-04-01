import { describe, it, expect } from 'vitest';
import { extractImportsExports, formatImportExportHeader } from '../lib/imports.js';

describe('Import/Export Extraction', () => {
  describe('JavaScript/TypeScript', () => {
    it('extracts ES module imports', () => {
      const code = `
import { foo, bar } from './utils';
import baz from 'lodash';
import './styles.css';
      `.trim();
      const { imports } = extractImportsExports(code, 'js');
      expect(imports).toContain('foo');
      expect(imports).toContain('bar');
      expect(imports).toContain('baz');
    });

    it('extracts CommonJS requires', () => {
      const code = `
const { readFile } = require('fs');
const path = require('path');
      `.trim();
      const { imports } = extractImportsExports(code, 'js');
      expect(imports).toContain('readFile');
      expect(imports).toContain('path');
    });

    it('extracts named exports', () => {
      const code = `
export function authenticate(token) { return true; }
export class AuthService {}
export const VERSION = '1.0';
export { foo, bar };
      `.trim();
      const { exports } = extractImportsExports(code, 'js');
      expect(exports).toContain('authenticate');
      expect(exports).toContain('AuthService');
      expect(exports).toContain('VERSION');
      expect(exports).toContain('foo');
    });

    it('extracts default exports', () => {
      const code = `export default function main() {}`;
      const { exports } = extractImportsExports(code, 'js');
      expect(exports).toContain('main');
    });

    it('handles TS extensions', () => {
      const code = `import { Server } from '@modelcontextprotocol/sdk';`;
      const { imports } = extractImportsExports(code, 'ts');
      expect(imports).toContain('Server');
    });
  });

  describe('Python', () => {
    it('extracts from-imports', () => {
      const code = `
from os.path import join, dirname
from typing import Optional
import json
      `.trim();
      const { imports } = extractImportsExports(code, 'py');
      expect(imports).toContain('join');
      expect(imports).toContain('dirname');
      expect(imports).toContain('json');
    });

    it('extracts function and class definitions as exports', () => {
      const code = `
def process(data):
    pass

class Handler:
    pass

async def fetch():
    pass
      `.trim();
      const { exports } = extractImportsExports(code, 'py');
      expect(exports).toContain('process');
      expect(exports).toContain('Handler');
      expect(exports).toContain('fetch');
    });
  });

  describe('Rust', () => {
    it('extracts use statements', () => {
      const code = `
use std::collections::HashMap;
use crate::config::Config;
      `.trim();
      const { imports } = extractImportsExports(code, 'rs');
      expect(imports.length).toBeGreaterThan(0);
    });

    it('extracts pub items', () => {
      const code = `
pub fn main() {}
pub struct Config {}
pub enum Command {}
pub trait Handler {}
      `.trim();
      const { exports } = extractImportsExports(code, 'rs');
      expect(exports).toContain('main');
      expect(exports).toContain('Config');
      expect(exports).toContain('Command');
      expect(exports).toContain('Handler');
    });
  });

  describe('Go', () => {
    it('extracts exported funcs (capital letter)', () => {
      const code = `
func NewServer(port int) *Server { return nil }
func main() {}
func (s *Server) HandleRequest() {}
      `.trim();
      const { exports } = extractImportsExports(code, 'go');
      expect(exports).toContain('NewServer');
      expect(exports).toContain('HandleRequest');
      expect(exports).not.toContain('main'); // lowercase = unexported
    });
  });

  describe('Java', () => {
    it('extracts public classes and methods', () => {
      const code = `
import java.util.List;
public class UserService {
    public User findById(long id) { return null; }
    private void log(String msg) {}
}
      `.trim();
      const ie = extractImportsExports(code, 'java');
      expect(ie.imports.length).toBeGreaterThan(0);
      expect(ie.exports).toContain('UserService');
    });
  });

  describe('C#', () => {
    it('extracts using and public types', () => {
      const code = `
using System.Collections.Generic;
public class OrderController {
    public async Task<Order> GetOrder(int id) { return null; }
}
      `.trim();
      const ie = extractImportsExports(code, 'cs');
      expect(ie.imports.length).toBeGreaterThan(0);
      expect(ie.exports).toContain('OrderController');
    });
  });

  describe('Unsupported languages', () => {
    it('returns empty arrays for unknown extensions', () => {
      const { imports, exports } = extractImportsExports('some code', 'xyz');
      expect(imports).toEqual([]);
      expect(exports).toEqual([]);
    });
  });
});

describe('Header Formatting', () => {
  it('formats exports and imports header', () => {
    const header = formatImportExportHeader(
      { imports: ['db', 'config'], exports: ['AuthService', 'login'] },
    );
    expect(header).toContain('EXPORTS: { AuthService, login }');
    expect(header).toContain('IMPORTS: { db, config }');
  });

  it('uses custom comment prefix', () => {
    const header = formatImportExportHeader(
      { imports: ['os'], exports: ['main'] },
      '#',
    );
    expect(header).toContain('# EXPORTS');
    expect(header).toContain('# IMPORTS');
  });

  it('handles empty arrays gracefully', () => {
    const header = formatImportExportHeader({ imports: [], exports: [] });
    expect(header).toBe('');
  });
});
