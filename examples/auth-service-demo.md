# Example: Understanding auth-service.js

**Task**: "Explain how login works in this auth service"

**Source file**: 449 lines, 1,060 tokens

---

## Approach 1: Raw read (baseline)

Agent reads the entire file: **1,060 tokens consumed**.

The agent sees 449 lines including JSDoc blocks, comments, logger calls, and boilerplate.
It can answer the question, but it consumed the full token budget for one file.

---

## Approach 2: fullscope_skeleton -> fullscope_expand (progressive disclosure)

### Step 1: fullscope_skeleton (60 tokens, 94% saved)

```js
import { db } from './db';
import { config } from './config';
import { hash, verify } from './crypto';
import jwt from 'jsonwebtoken';
import { EventEmitter } from 'events';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;

export class AuthService extends EventEmitter { /* 319 lines -- expand: fn:AuthService */ }

export default AuthService;
```

The agent now knows:
- It's a class extending EventEmitter
- It uses JWT, password hashing, and a database
- There are lockout and token expiry constants

To answer "how does login work?", it expands just the login function.

### Step 2: fullscope_expand fn:login (227 tokens)

```js
async login(email, password, options = {}) {
    const normalizedEmail = email.toLowerCase();

    const attempts = this.loginAttempts.get(normalizedEmail);
    if (attempts && attempts.count >= this.maxAttempts) {
      const timeSinceLockout = Date.now() - attempts.lastAttempt;
      if (timeSinceLockout < LOCKOUT_DURATION) {
        const remainingMs = LOCKOUT_DURATION - timeSinceLockout;
        const remainingMin = Math.ceil(remainingMs / 60000);
        this.emit('lockout', { email: normalizedEmail, remainingMin });
        throw new Error(`Account locked. Try again in ${remainingMin} minutes.`);
      }
      this.loginAttempts.delete(normalizedEmail);
    }

    const user = await this.db.users.findOne({ email: normalizedEmail });
    if (!user) {
      this.recordFailedAttempt(normalizedEmail);
      throw new Error('Invalid credentials');
    }

    if (user.status === 'suspended') {
      throw new Error('Account suspended. Contact support.');
    }

    const isValid = await verify(password, user.passwordHash);
    if (!isValid) {
      this.recordFailedAttempt(normalizedEmail);
      throw new Error('Invalid credentials');
    }

    this.loginAttempts.delete(normalizedEmail);

    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    const session = { userId: user.id, refreshToken, ... };
    this.sessions.set(refreshToken, session);

    await this.db.users.update(user.id, { loginCount: ... });
    this.emit('login', { userId: user.id, email: normalizedEmail });

    return { user: { id, email, profile }, tokens: { accessToken, refreshToken } };
  }
```

---

## Result

| Metric | Raw read | fullscope flow |
|--------|---------|----------|
| Tokens consumed | 1,060 | 287 (60 + 227) |
| Tool calls | 1 | 2 |
| Savings | -- | **73%** |
| Answer quality | Full | Same -- all login logic visible |

The agent answered the same question with **73% fewer tokens** and **2 targeted reads** instead of 1 bulk read. On a 30-file session, this compounds to thousands of saved tokens.
