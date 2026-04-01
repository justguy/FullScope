import { describe, it, expect, beforeAll } from 'vitest';
import { skeletonize, collapseBlocks } from '../lib/skeleton.js';
import { expandFunction } from '../lib/expand.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const TMP_DIR = join(import.meta.dirname, '.tmp-class');

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

function writeTmp(name, content) {
  const p = join(TMP_DIR, name);
  writeFileSync(p, content);
  return p;
}

// ─── Skeleton: per-method handles inside classes ───

describe('Class method skeleton handles', () => {
  it('JS class shows per-method expand handles', () => {
    const code = `
class UserService {
  constructor(db) {
    this.db = db;
  }

  async findUser(id) {
    return this.db.find(id);
  }

  async createUser(data) {
    const user = { ...data, id: Date.now() };
    return this.db.insert(user);
  }

  deleteUser(id) {
    return this.db.delete(id);
  }
}`.trim();

    const result = skeletonize(code, 'js');
    expect(result).toContain('class UserService');
    expect(result).toMatch(/expand: fn:constructor/);
    expect(result).toMatch(/expand: fn:findUser/);
    expect(result).toMatch(/expand: fn:createUser/);
    expect(result).toMatch(/expand: fn:deleteUser/);
    // Bodies should be collapsed
    expect(result).not.toContain('this.db.find');
    expect(result).not.toContain('Date.now');
    expect(result).not.toContain('this.db.delete');
  });

  it('TS class with typed methods shows per-method handles', () => {
    const code = `
export class AuthService {
  private secret: string;

  constructor(config: Config) {
    this.secret = config.jwtSecret;
  }

  async login(email: string, password: string): Promise<Token> {
    const user = await this.db.find({ email });
    if (!user) throw new Error('not found');
    return this.generateToken(user);
  }

  private generateToken(user: User): Token {
    return jwt.sign({ id: user.id }, this.secret);
  }
}`.trim();

    const result = skeletonize(code, 'ts');
    expect(result).toContain('class AuthService');
    expect(result).toMatch(/expand: fn:constructor/);
    expect(result).toMatch(/expand: fn:login/);
    expect(result).toMatch(/expand: fn:generateToken/);
    expect(result).not.toContain('jwt.sign');
  });

  it('Rust impl block shows per-method handles', () => {
    const code = `
impl Server {
    pub fn new(port: u16) -> Self {
        Server { port, running: false }
    }

    pub async fn start(&mut self) -> Result<()> {
        self.running = true;
        self.listen().await
    }

    fn listen(&self) -> Result<()> {
        loop { self.accept(); }
    }
}`.trim();

    const result = skeletonize(code, 'rs');
    expect(result).toContain('impl Server');
    expect(result).toMatch(/expand: fn:new/);
    expect(result).toMatch(/expand: fn:start/);
    expect(result).toMatch(/expand: fn:listen/);
    expect(result).not.toContain('self.running = true');
    expect(result).not.toContain('self.accept');
  });

  it('standalone functions still collapse normally', () => {
    const code = `
function helper() {
  return 42;
}

class Foo {
  bar() {
    return 1;
  }
}

function another() {
  return 99;
}`.trim();

    const result = skeletonize(code, 'js');
    expect(result).toMatch(/expand: fn:helper/);
    expect(result).toMatch(/expand: fn:bar/);
    expect(result).toMatch(/expand: fn:another/);
    expect(result).not.toContain('return 42');
    expect(result).not.toContain('return 1');
    expect(result).not.toContain('return 99');
  });

  it('nested classes do not break', () => {
    const code = `
class Outer {
  method() {
    const x = 1;
    return x;
  }
}`.trim();

    const result = collapseBlocks(code);
    expect(result).toContain('class Outer');
    expect(result).toMatch(/expand: fn:method/);
    expect(result).not.toContain('const x = 1');
  });
});

// ─── Expand: per-method expand inside classes ───

describe('Expand class methods', () => {
  const jsClass = `
class Calculator {
  constructor(precision) {
    this.precision = precision;
  }

  add(a, b) {
    return Number((a + b).toFixed(this.precision));
  }

  subtract(a, b) {
    return Number((a - b).toFixed(this.precision));
  }

  multiply(a, b) {
    return Number((a * b).toFixed(this.precision));
  }
}`.trim();

  it('expands a specific class method, not the whole class', () => {
    const path = writeTmp('calculator.js', jsClass);
    const result = expandFunction(path, 'fn:add');
    expect(result).toContain('add');
    expect(result).toContain('toFixed');
    // Should NOT contain other methods
    expect(result).not.toContain('subtract');
    expect(result).not.toContain('multiply');
  });

  it('expands constructor', () => {
    const path = writeTmp('calculator2.js', jsClass);
    const result = expandFunction(path, 'fn:constructor');
    expect(result).toContain('constructor');
    expect(result).toContain('this.precision');
    expect(result).not.toContain('toFixed');
  });

  it('expands multiply without other methods', () => {
    const path = writeTmp('calculator3.js', jsClass);
    const result = expandFunction(path, 'fn:multiply');
    expect(result).toContain('multiply');
    expect(result).toContain('a * b');
    expect(result).not.toContain('a + b');
    expect(result).not.toContain('a - b');
  });

  it('expands multi-line TS signature', () => {
    const code = `
class Service {
  async processOrder(
    orderId: string,
    options: ProcessOptions,
  ): Promise<OrderResult> {
    const order = await this.db.find(orderId);
    return this.fulfill(order, options);
  }

  simple() {
    return true;
  }
}`.trim();
    const path = writeTmp('multiline.ts', code);
    const result = expandFunction(path, 'fn:processOrder');
    expect(result).toContain('processOrder');
    expect(result).toContain('this.db.find');
    expect(result).toContain('this.fulfill');
    expect(result).not.toContain('return true');
  });

  it('expands Rust impl method', () => {
    const code = `
impl Config {
    pub fn validate(&self) -> bool {
        !self.name.is_empty() && self.value > 0
    }

    pub fn reset(&mut self) {
        self.name = String::new();
        self.value = 0;
    }
}`.trim();
    const path = writeTmp('config.rs', code);
    const result = expandFunction(path, 'fn:validate');
    expect(result).toContain('validate');
    expect(result).toContain('is_empty');
    expect(result).not.toContain('String::new');
  });
});
