# Project Architecture Guide

This document describes the architecture of the authentication service,
including design decisions, data flow, and deployment considerations.

## Overview

The authentication service handles user identity management across
the platform. It provides login, registration, token refresh, and
session management capabilities.

### Key Design Decisions

1. **JWT-based authentication** -- stateless tokens reduce database load
2. **Refresh token rotation** -- each refresh invalidates the previous token
3. **Rate limiting** -- per-IP throttling prevents brute force attacks
4. **Account lockout** -- 5 failed attempts triggers a 15-minute lockout

## Architecture Diagram

```
┌─────────┐     ┌──────────┐     ┌──────────┐
│  Client  │────▶│  API GW  │────▶│  Auth    │
│          │◀────│          │◀────│  Service  │
└─────────┘     └──────────┘     └──────┬───┘
                                        │
                                  ┌─────▼─────┐
                                  │  Database  │
                                  └───────────┘
```

## Data Flow

### Login Flow

1. Client sends `POST /auth/login` with email and password
2. Auth service validates credentials against the database
3. On success, generates JWT access token (15min) and refresh token (7d)
4. Returns tokens to client

```javascript
// Example login request
const response = await fetch('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const { accessToken, refreshToken } = await response.json();
```

### Token Refresh Flow

1. Client sends `POST /auth/refresh` with refresh token
2. Auth service validates refresh token
3. Generates new access token
4. Returns new token pair

```python
# Python client example
import requests

response = requests.post('/auth/refresh', json={
    'refresh_token': stored_refresh_token
})
new_tokens = response.json()
```

## Database Schema

### Users Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| name | VARCHAR(100) | |
| status | ENUM | DEFAULT 'active' |
| failed_attempts | INT | DEFAULT 0 |
| last_login | TIMESTAMP | |
| created_at | TIMESTAMP | DEFAULT NOW() |

### Sessions Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| user_id | UUID | FOREIGN KEY |
| refresh_token | VARCHAR(500) | UNIQUE |
| ip_address | VARCHAR(45) | |
| user_agent | TEXT | |
| created_at | TIMESTAMP | |
| last_activity | TIMESTAMP | |

## Configuration

The service reads configuration from environment variables:

```yaml
# docker-compose.yml excerpt
environment:
  JWT_SECRET: ${JWT_SECRET}
  ACCESS_TOKEN_EXPIRY: 15m
  REFRESH_TOKEN_EXPIRY: 7d
  MAX_LOGIN_ATTEMPTS: 5
  LOCKOUT_DURATION: 15m
  DATABASE_URL: postgresql://user:pass@db:5432/auth
  REDIS_URL: redis://cache:6379
```

## Error Handling

All errors follow a standard format:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "detail": "Additional context if available"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| AUTH_INVALID_CREDENTIALS | 401 | Wrong email or password |
| AUTH_ACCOUNT_LOCKED | 401 | Too many failed attempts |
| AUTH_TOKEN_EXPIRED | 401 | Access token has expired |
| AUTH_TOKEN_INVALID | 401 | Token is malformed or tampered |
| AUTH_EMAIL_EXISTS | 409 | Email already registered |
| AUTH_RATE_LIMITED | 429 | Too many requests |

## Deployment

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 7+ (for session caching)

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| JWT_SECRET | Yes | - | Secret key for JWT signing |
| DATABASE_URL | Yes | - | PostgreSQL connection string |
| REDIS_URL | No | - | Redis connection (optional) |
| PORT | No | 3000 | Server port |
| LOG_LEVEL | No | info | Logging verbosity |

### Health Check

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "healthy",
  "database": "connected",
  "active_sessions": 42,
  "uptime": 86400
}
```

## Security Considerations

- Passwords are hashed with bcrypt (cost factor 12)
- JWT tokens are signed with HS256
- Refresh tokens are stored hashed in the database
- All endpoints are rate-limited
- Failed login attempts are logged for audit
- Account lockout prevents brute force

## Monitoring

Key metrics to track:

- Login success/failure rate
- Token refresh frequency
- Active session count
- Average login latency
- Rate limit hit rate
- Account lockout events

## Changelog

### v2.0.0

- Added refresh token rotation
- Implemented account lockout
- Added rate limiting per IP

### v1.1.0

- Added session tracking
- Improved error messages

### v1.0.0

- Initial release
- Basic login/register
- JWT token generation
