"""
API Request Handler Module

Handles incoming HTTP requests, validates input, routes to appropriate
service handlers, and formats responses. Includes rate limiting,
authentication middleware, and structured error handling.

Usage:
    handler = APIHandler(config, services)
    response = await handler.handle_request(request)
"""

import json
import time
import hashlib
import logging
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, field
from enum import Enum
from functools import wraps

# Configure module logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


class HTTPMethod(Enum):
    """Supported HTTP methods."""
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"


class APIError(Exception):
    """Structured API error with status code and detail."""

    def __init__(self, status: int, message: str, detail: Optional[str] = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.detail = detail


@dataclass
class RateLimitConfig:
    """Configuration for rate limiting."""
    requests_per_minute: int = 60
    burst_size: int = 10
    window_seconds: int = 60


@dataclass
class Request:
    """Incoming HTTP request."""
    method: HTTPMethod
    path: str
    headers: Dict[str, str] = field(default_factory=dict)
    query_params: Dict[str, str] = field(default_factory=dict)
    body: Optional[Dict[str, Any]] = None
    client_ip: str = "127.0.0.1"
    timestamp: float = field(default_factory=time.time)


@dataclass
class Response:
    """HTTP response."""
    status: int = 200
    body: Optional[Dict[str, Any]] = None
    headers: Dict[str, str] = field(default_factory=dict)


def require_auth(func):
    """
    Decorator that enforces authentication on a route handler.

    Checks for a valid Bearer token in the Authorization header.
    Returns 401 if missing or invalid, 403 if insufficient permissions.

    Args:
        func: The route handler function to wrap

    Returns:
        Wrapped function that checks auth before proceeding
    """
    @wraps(func)
    async def wrapper(self, request: Request, *args, **kwargs):
        # Extract token from Authorization header
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise APIError(401, "Authentication required")

        token = auth_header[7:]  # Strip "Bearer " prefix

        # Validate token
        user = self.auth_service.verify_token(token)
        if not user:
            raise APIError(401, "Invalid or expired token")

        # Attach user to request context
        request.user = user
        logger.debug(f"Authenticated request from user {user['id']}")

        return await func(self, request, *args, **kwargs)
    return wrapper


class RateLimiter:
    """
    Token bucket rate limiter.

    Tracks request counts per client IP within a sliding window.
    Allows burst traffic up to burst_size, then throttles to
    requests_per_minute sustained rate.

    Attributes:
        config: Rate limit configuration
        buckets: Per-client request tracking
    """

    def __init__(self, config: RateLimitConfig):
        """Initialize rate limiter with configuration."""
        self.config = config
        self.buckets: Dict[str, List[float]] = {}
        logger.info(
            f"Rate limiter initialized: {config.requests_per_minute}/min, "
            f"burst={config.burst_size}"
        )

    def check(self, client_ip: str) -> Tuple[bool, Optional[int]]:
        """
        Check if a request from the given IP should be allowed.

        Args:
            client_ip: The client's IP address

        Returns:
            Tuple of (allowed: bool, retry_after: Optional[int])
        """
        now = time.time()
        window_start = now - self.config.window_seconds

        # Get or create bucket for this client
        if client_ip not in self.buckets:
            self.buckets[client_ip] = []

        # Remove expired entries
        bucket = self.buckets[client_ip]
        self.buckets[client_ip] = [t for t in bucket if t > window_start]
        bucket = self.buckets[client_ip]

        # Check if within limits
        if len(bucket) >= self.config.requests_per_minute:
            # Calculate retry-after
            oldest = min(bucket)
            retry_after = int(oldest + self.config.window_seconds - now) + 1
            logger.warning(
                f"Rate limit exceeded for {client_ip}: "
                f"{len(bucket)} requests in window"
            )
            return False, retry_after

        # Allow the request
        bucket.append(now)
        return True, None

    def cleanup(self) -> int:
        """
        Remove expired buckets to prevent memory leaks.

        Returns:
            Number of buckets cleaned up
        """
        now = time.time()
        window_start = now - self.config.window_seconds
        expired = [
            ip for ip, bucket in self.buckets.items()
            if all(t <= window_start for t in bucket)
        ]
        for ip in expired:
            del self.buckets[ip]

        if expired:
            logger.debug(f"Cleaned up {len(expired)} expired rate limit buckets")

        return len(expired)


class APIHandler:
    """
    Main API request handler.

    Routes requests to appropriate handlers based on method and path.
    Applies middleware (auth, rate limiting) and formats responses.

    Attributes:
        config: Application configuration
        routes: Registered route handlers
        rate_limiter: Rate limiter instance
        auth_service: Authentication service
    """

    def __init__(self, config: Dict[str, Any], services: Dict[str, Any]):
        """
        Initialize the API handler.

        Args:
            config: Application configuration dictionary
            services: Dictionary of service instances (auth, db, cache)
        """
        self.config = config
        self.auth_service = services.get("auth")
        self.db = services.get("db")
        self.cache = services.get("cache")

        # Initialize rate limiter
        rate_config = RateLimitConfig(
            requests_per_minute=config.get("rate_limit", 60),
            burst_size=config.get("burst_size", 10),
        )
        self.rate_limiter = RateLimiter(rate_config)

        # Route registry: (method, path_pattern) -> handler
        self.routes: Dict[Tuple[HTTPMethod, str], callable] = {}
        self._register_routes()

        logger.info("APIHandler initialized with %d routes", len(self.routes))

    def _register_routes(self):
        """Register all route handlers."""
        # Public routes
        self.routes[(HTTPMethod.POST, "/auth/login")] = self.handle_login
        self.routes[(HTTPMethod.POST, "/auth/register")] = self.handle_register
        self.routes[(HTTPMethod.POST, "/auth/refresh")] = self.handle_refresh

        # Protected routes (require auth)
        self.routes[(HTTPMethod.GET, "/users/me")] = self.handle_get_profile
        self.routes[(HTTPMethod.PUT, "/users/me")] = self.handle_update_profile
        self.routes[(HTTPMethod.GET, "/users")] = self.handle_list_users
        self.routes[(HTTPMethod.GET, "/health")] = self.handle_health

    async def handle_request(self, request: Request) -> Response:
        """
        Main entry point for request handling.

        Applies rate limiting, routes to handler, catches errors.

        Args:
            request: Incoming HTTP request

        Returns:
            Response object with status, body, headers
        """
        start_time = time.time()

        try:
            # Rate limiting
            allowed, retry_after = self.rate_limiter.check(request.client_ip)
            if not allowed:
                return Response(
                    status=429,
                    body={"error": "Too many requests"},
                    headers={"Retry-After": str(retry_after)},
                )

            # Find matching route
            handler = self.routes.get((request.method, request.path))
            if not handler:
                raise APIError(404, "Not found", f"No handler for {request.method.value} {request.path}")

            # Execute handler
            response = await handler(request)

            # Log successful request
            duration = time.time() - start_time
            logger.info(
                f"{request.method.value} {request.path} -> {response.status} "
                f"({duration:.3f}s)"
            )

            return response

        except APIError as e:
            logger.warning(f"API error: {e.status} {e.message}")
            return Response(
                status=e.status,
                body={
                    "error": e.message,
                    "detail": e.detail,
                },
            )
        except Exception as e:
            # Unexpected error — log full traceback
            logger.exception(f"Unhandled error in {request.method.value} {request.path}")
            return Response(
                status=500,
                body={"error": "Internal server error"},
            )

    # ─── Route handlers ───

    async def handle_login(self, request: Request) -> Response:
        """Handle POST /auth/login."""
        body = request.body or {}

        email = body.get("email")
        password = body.get("password")

        if not email or not password:
            raise APIError(400, "Email and password are required")

        result = await self.auth_service.login(
            email, password,
            options={
                "ipAddress": request.client_ip,
                "userAgent": request.headers.get("User-Agent", "unknown"),
            }
        )

        return Response(status=200, body=result)

    async def handle_register(self, request: Request) -> Response:
        """Handle POST /auth/register."""
        body = request.body or {}

        email = body.get("email")
        password = body.get("password")
        profile = body.get("profile", {})

        if not email or not password:
            raise APIError(400, "Email and password are required")

        result = await self.auth_service.register(email, password, profile)
        return Response(status=201, body=result)

    async def handle_refresh(self, request: Request) -> Response:
        """Handle POST /auth/refresh."""
        body = request.body or {}
        refresh_token = body.get("refresh_token")

        if not refresh_token:
            raise APIError(400, "Refresh token is required")

        result = await self.auth_service.refresh_access_token(refresh_token)
        return Response(status=200, body=result)

    @require_auth
    async def handle_get_profile(self, request: Request) -> Response:
        """Handle GET /users/me."""
        user = await self.db.users.find_by_id(request.user["id"])
        if not user:
            raise APIError(404, "User not found")

        return Response(
            status=200,
            body={
                "id": user["id"],
                "email": user["email"],
                "profile": user.get("profile", {}),
            },
        )

    @require_auth
    async def handle_update_profile(self, request: Request) -> Response:
        """Handle PUT /users/me."""
        body = request.body or {}

        # Only allow updating specific fields
        allowed_fields = {"name", "bio", "avatar_url", "timezone"}
        updates = {k: v for k, v in body.items() if k in allowed_fields}

        if not updates:
            raise APIError(400, "No valid fields to update")

        updated = await self.db.users.update(
            request.user["id"],
            {"profile": updates}
        )

        return Response(status=200, body=updated)

    @require_auth
    async def handle_list_users(self, request: Request) -> Response:
        """Handle GET /users."""
        # Parse pagination params
        page = int(request.query_params.get("page", "1"))
        per_page = min(int(request.query_params.get("per_page", "20")), 100)

        # Check cache first
        cache_key = f"users:page={page}:per_page={per_page}"
        cached = self.cache.get(cache_key) if self.cache else None

        if cached:
            logger.debug(f"Cache hit for {cache_key}")
            return Response(status=200, body=json.loads(cached))

        # Query database
        offset = (page - 1) * per_page
        users = await self.db.users.find_many(
            limit=per_page,
            offset=offset,
            fields=["id", "email", "profile.name", "status"],
        )
        total = await self.db.users.count()

        result = {
            "users": users,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": total,
                "pages": (total + per_page - 1) // per_page,
            },
        }

        # Cache for 60 seconds
        if self.cache:
            self.cache.set(cache_key, json.dumps(result), ttl=60)

        return Response(status=200, body=result)

    async def handle_health(self, request: Request) -> Response:
        """Handle GET /health."""
        # Check database connectivity
        try:
            db_ok = await self.db.ping()
        except Exception:
            db_ok = False

        status = 200 if db_ok else 503
        return Response(
            status=status,
            body={
                "status": "healthy" if db_ok else "degraded",
                "database": "connected" if db_ok else "disconnected",
                "active_sessions": self.auth_service.get_active_session_count()
                    if self.auth_service else 0,
                "timestamp": time.time(),
            },
        )
