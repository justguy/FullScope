import { describe, it, expect } from 'vitest';
import { skeletonize, isSignatureLine, collapseBlocks } from '../lib/skeleton.js';

describe('Signature Detection', () => {
  it('detects JS function declarations', () => {
    expect(isSignatureLine('function foo() {')).toBe(true);
    expect(isSignatureLine('async function bar(x, y) {')).toBe(true);
    expect(isSignatureLine('export default function baz() {')).toBe(true);
    expect(isSignatureLine('export async function qux() {')).toBe(true);
  });

  it('detects JS arrow functions', () => {
    expect(isSignatureLine('const foo = (x) => {')).toBe(true);
    expect(isSignatureLine('export const bar = async (x) => {')).toBe(true);
  });

  it('detects JS class declarations', () => {
    expect(isSignatureLine('class Foo {')).toBe(true);
    expect(isSignatureLine('export class Bar extends Baz {')).toBe(true);
    expect(isSignatureLine('export default class {')).toBe(true);
  });

  it('detects JS method signatures', () => {
    expect(isSignatureLine('  get name() {')).toBe(true);
    expect(isSignatureLine('  set value(v) {')).toBe(true);
    expect(isSignatureLine('  public static async fetch() {')).toBe(true);
    expect(isSignatureLine('  private handleClick(e) {')).toBe(true);
  });

  it('detects Rust signatures', () => {
    expect(isSignatureLine('pub fn main() {')).toBe(true);
    expect(isSignatureLine('fn helper(x: i32) -> bool {')).toBe(true);
    expect(isSignatureLine('pub struct Config {')).toBe(true);
    expect(isSignatureLine('impl Display for Foo {')).toBe(true);
    expect(isSignatureLine('pub async fn fetch() {')).toBe(true);
  });

  it('detects Go signatures', () => {
    expect(isSignatureLine('func main() {')).toBe(true);
    expect(isSignatureLine('func (s *Server) Handle() {')).toBe(true);
    expect(isSignatureLine('type Config struct {')).toBe(true);
    expect(isSignatureLine('type Handler interface {')).toBe(true);
  });

  it('detects Java/C# signatures', () => {
    expect(isSignatureLine('public class Foo {')).toBe(true);
    expect(isSignatureLine('private void doThing(int x) {')).toBe(true);
    expect(isSignatureLine('public static void main(String[] args) {')).toBe(true);
    expect(isSignatureLine('internal class Bar {')).toBe(true);
    expect(isSignatureLine('protected override async Task Run() {')).toBe(true);
  });

  it('does not match data lines', () => {
    expect(isSignatureLine('const x = 42;')).toBe(false);
    expect(isSignatureLine('return result;')).toBe(false);
    expect(isSignatureLine('if (condition) {')).toBe(false);
    expect(isSignatureLine('for (let i = 0; i < 10; i++) {')).toBe(false);
  });
});

describe('Block Collapsing', () => {
  it('collapses function body to placeholder', () => {
    const input = `function foo() {
  const x = 1;
  return x + 2;
}`;
    const result = collapseBlocks(input);
    expect(result).toMatch(/function foo\(\) \{ \/\* \d+ lines — expand: fn:foo \*\/ \}/);
    expect(result).not.toContain('const x = 1');
  });

  it('handles nested braces', () => {
    const input = `function foo() {
  if (true) {
    for (let i = 0; i < 10; i++) {
      console.log(i);
    }
  }
}`;
    const result = collapseBlocks(input);
    expect(result).toMatch(/function foo\(\) \{ \/\* \d+ lines — expand: fn:foo \*\/ \}/);
    expect(result).not.toContain('console.log');
  });

  it('preserves non-signature blocks', () => {
    const input = `const config = {
  key: "value",
  nested: { a: 1 }
};`;
    const result = collapseBlocks(input);
    expect(result).toContain('key: "value"');
  });

  it('handles empty functions', () => {
    const input = 'function noop() {}';
    // This doesn't end with { on a signature line (it has {} on same line)
    const result = collapseBlocks(input);
    expect(result).toContain('function noop()');
  });
});

describe('Language-Specific Skeletonization', () => {
  it('JS: strips comments and collapses functions', () => {
    const input = `
// Module for handling auth
import { db } from './db';

/**
 * Authenticate a user.
 * @param token - JWT token
 */
export function authenticate(token) {
  const decoded = jwt.verify(token);
  if (!decoded) throw new Error('bad token');
  return db.findUser(decoded.id);
}

export class AuthService {
  constructor(config) {
    this.config = config;
    this.cache = new Map();
  }

  async login(email, password) {
    const user = await db.find({ email });
    if (!user || !verify(password, user.hash)) {
      throw new Error('invalid');
    }
    return generateToken(user);
  }
}
    `.trim();

    const result = skeletonize(input, 'js');
    // Should contain signatures
    expect(result).toContain('export function authenticate');
    expect(result).toContain('export class AuthService');
    // Should NOT contain implementation
    expect(result).not.toContain('jwt.verify');
    expect(result).not.toContain('new Map()');
    expect(result).not.toContain('generateToken');
    // Should NOT contain comments
    expect(result).not.toContain('Module for handling');
    expect(result).not.toContain('Authenticate a user');
  });

  it('Python: collapses function bodies to pass', () => {
    const input = `
import os
from typing import Optional

def greet(name: str) -> str:
    """Say hello to someone."""
    greeting = f"Hello, {name}!"
    print(greeting)
    return greeting

class Service:
    def __init__(self, config):
        self.config = config
        self.ready = False

    async def start(self):
        await self.connect()
        self.ready = True
    `.trim();

    const result = skeletonize(input, 'py');
    expect(result).toContain('def greet');
    expect(result).toContain('class Service');
    // Python ast collapses entire class body including methods — correct behavior
    // Inner methods like __init__ are inside the class body scope
    expect(result).not.toContain('f"Hello');
    expect(result).not.toContain('await self.connect');
  });

  it('Rust: collapses fn and impl blocks', () => {
    const input = `
use std::collections::HashMap;

pub struct Config {
    pub name: String,
    pub value: i32,
}

impl Config {
    pub fn new(name: &str) -> Self {
        Config {
            name: name.to_string(),
            value: 0,
        }
    }

    pub fn validate(&self) -> bool {
        !self.name.is_empty() && self.value > 0
    }
}
    `.trim();

    const result = skeletonize(input, 'rs');
    expect(result).toContain('pub struct Config');
    expect(result).toContain('impl Config');
    // impl body shows per-method signatures with expand handles
    expect(result).toContain('pub fn new');
    expect(result).toContain('pub fn validate');
    expect(result).toMatch(/expand: fn:new/);
    expect(result).toMatch(/expand: fn:validate/);
    // Method bodies are collapsed
    expect(result).not.toContain('name.to_string()');
    expect(result).not.toContain('is_empty');
  });

  it('Go: collapses func blocks', () => {
    const input = `
package main

import "fmt"

type Server struct {
    port int
    name string
}

func NewServer(port int) *Server {
    return &Server{port: port, name: "default"}
}

func (s *Server) Start() error {
    fmt.Printf("Starting %s on port %d", s.name, s.port)
    return nil
}
    `.trim();

    const result = skeletonize(input, 'go');
    expect(result).toContain('type Server struct');
    expect(result).toContain('func NewServer');
    expect(result).toContain('func (s *Server) Start');
    expect(result).not.toContain('fmt.Printf');
  });

  it('handles empty input', () => {
    expect(skeletonize('', 'js')).toBe('');
    expect(skeletonize('', 'py')).toBe('');
    expect(skeletonize('', 'rs')).toBe('');
  });

  it('returns something for unknown extensions', () => {
    const input = 'some { code } here';
    const result = skeletonize(input, 'xyz');
    expect(typeof result).toBe('string');
  });
});
