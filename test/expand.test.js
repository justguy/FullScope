import { describe, it, expect, beforeAll } from 'vitest';
import { expandFunction } from '../lib/expand.js';
import { skeletonize } from '../lib/skeleton.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const TMP_DIR = join(import.meta.dirname, '.tmp-expand');
const AUTH_FIXTURE = join(import.meta.dirname, 'fixtures', 'auth-service.js');

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

function writeTmp(name, content) {
  const p = join(TMP_DIR, name);
  writeFileSync(p, content);
  return p;
}

describe('fullscope_expand', () => {
  it('expands a JS function by handle', () => {
    const code = `
function greet(name) {
  const msg = "Hello, " + name;
  console.log(msg);
  return msg;
}

function farewell(name) {
  return "Goodbye, " + name;
}
`.trim();
    const path = writeTmp('expand-js.js', code);
    const result = expandFunction(path, 'fn:greet');

    expect(result).toContain('greet');
    expect(result).toContain('Hello');
    expect(result).toContain('return msg');
    // Should not contain the other function
    expect(result).not.toContain('farewell');
    expect(result).not.toContain('Goodbye');
    // Should have safety footer
    expect(result).toContain('COMPRESSED VIEW');
  });

  it('expands a specific function from a multi-function file', () => {
    const code = `
function alpha() {
  return 1;
}

function beta() {
  const x = 2;
  const y = 3;
  return x + y;
}

function gamma() {
  return 99;
}
`.trim();
    const path = writeTmp('expand-multi.js', code);
    const result = expandFunction(path, 'fn:beta');

    expect(result).toContain('beta');
    expect(result).toContain('x + y');
    expect(result).not.toContain('alpha');
    expect(result).not.toContain('gamma');
  });

  it('expands a Python function', () => {
    const code = `
def calculate(x, y):
    # Add two numbers
    result = x + y
    return result

def other():
    pass
`.trim();
    const path = writeTmp('expand-py.py', code);
    const result = expandFunction(path, 'fn:calculate');

    expect(result).toContain('calculate');
    expect(result).toContain('x + y');
    expect(result).not.toContain('def other');
  });

  it('returns error for invalid handle format', () => {
    const path = writeTmp('expand-err.js', 'function foo() {}');
    const result = expandFunction(path, 'invalid');
    expect(result).toContain('Invalid handle format');
  });

  it('returns error for function not found', () => {
    const code = 'function foo() { return 1; }';
    const path = writeTmp('expand-notfound.js', code);
    const result = expandFunction(path, 'fn:nonexistent');
    expect(result).toContain('not found');
  });

  it('skeleton output contains expand handles that work with expand', () => {
    const code = `
function login(user, pass) {
  const valid = checkPassword(user, pass);
  if (!valid) throw new Error('bad');
  return createSession(user);
}

function logout(session) {
  session.destroy();
}
`.trim();
    const path = writeTmp('expand-round.js', code);

    // Skeleton should contain expand handles
    const skeleton = skeletonize(code, 'js');
    expect(skeleton).toMatch(/expand: fn:login/);
    expect(skeleton).toMatch(/expand: fn:logout/);

    // Expand using those handles should work
    const expanded = expandFunction(path, 'fn:login');
    expect(expanded).toContain('checkPassword');
    expect(expanded).toContain('createSession');
    expect(expanded).not.toContain('session.destroy');
  });

  it('includes savings header', () => {
    const code = `
function verbose() {
  // This is a comment
  // Another comment
  const x = 1;
  return x;
}
`.trim();
    const path = writeTmp('expand-savings.js', code);
    const result = expandFunction(path, 'fn:verbose');
    expect(result).toContain('[fullscope:');
    expect(result).toContain('saved)]');
  });

  it('expands the actual auth-service login method instead of the whole class', () => {
    const result = expandFunction(AUTH_FIXTURE, 'fn:login');

    expect(result).toContain('── login');
    expect(result).toContain('lines 130-214');
    expect(result).toContain('normalizedEmail');
    expect(result).not.toContain('export class AuthService');
    expect(result).not.toContain('constructor(database, config)');
  });

  it('handles class expansion', () => {
    const code = `
class UserService {
  constructor(db) {
    this.db = db;
  }

  async findUser(id) {
    return this.db.find(id);
  }
}
`.trim();
    const path = writeTmp('expand-class.js', code);
    const result = expandFunction(path, 'fn:UserService');
    expect(result).toContain('UserService');
    expect(result).toContain('constructor');
  });
});
