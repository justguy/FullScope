/**
 * HTTP Server Module
 * Handles incoming requests, middleware chain, and route dispatch.
 *
 * @module server
 */

import express, { Request, Response, NextFunction } from 'express';
import { Logger } from './logger';
import { AuthMiddleware } from './auth';
import { RateLimiter } from './rate-limiter';

// Configuration defaults
const DEFAULT_PORT = 3000;
const MAX_REQUEST_SIZE = '10mb';
const SHUTDOWN_TIMEOUT = 5000;

interface ServerConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  rateLimitRpm: number;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  connections: number;
  memoryMB: number;
}

/**
 * Main application server.
 * Configures middleware, registers routes, handles graceful shutdown.
 */
export class AppServer {
  private app: express.Application;
  private logger: Logger;
  private config: ServerConfig;
  private startTime: number;
  private activeConnections: Set<string>;

  /**
   * Create a new server instance.
   * @param config - Server configuration
   * @param logger - Logger instance
   */
  constructor(config: ServerConfig, logger: Logger) {
    this.app = express();
    this.config = config;
    this.logger = logger;
    this.startTime = Date.now();
    this.activeConnections = new Set();

    this.setupMiddleware();
    this.registerRoutes();

    // Log startup configuration
    this.logger.info('Server initialized', {
      port: config.port,
      host: config.host,
      corsOrigins: config.corsOrigins.length,
    });
  }

  /**
   * Configure middleware chain.
   * Order matters: parsing → CORS → rate limiting → auth → routes.
   */
  private setupMiddleware(): void {
    // Body parsing
    this.app.use(express.json({ limit: MAX_REQUEST_SIZE }));
    this.app.use(express.urlencoded({ extended: true }));

    // CORS
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin;
      if (origin && this.config.corsOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }
      next();
    });

    // Rate limiting
    const rateLimiter = new RateLimiter(this.config.rateLimitRpm);
    this.app.use(rateLimiter.middleware());

    // Request logging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      this.logger.debug(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      next();
    });
  }

  /**
   * Register route handlers.
   */
  private registerRoutes(): void {
    // Health check (no auth)
    this.app.get('/health', this.handleHealth.bind(this));

    // Protected routes
    const auth = new AuthMiddleware();
    this.app.get('/api/users', auth.requireAuth, this.handleListUsers.bind(this));
    this.app.get('/api/users/:id', auth.requireAuth, this.handleGetUser.bind(this));
    this.app.post('/api/users', auth.requireAuth, this.handleCreateUser.bind(this));
    this.app.put('/api/users/:id', auth.requireAuth, this.handleUpdateUser.bind(this));
    this.app.delete('/api/users/:id', auth.requireAdmin, this.handleDeleteUser.bind(this));

    // Error handler (must be last)
    this.app.use(this.handleError.bind(this));
  }

  /**
   * Start listening for connections.
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.config.port, this.config.host, () => {
        this.logger.info(`Server listening on ${this.config.host}:${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * Graceful shutdown — wait for active connections to drain.
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down...', {
      activeConnections: this.activeConnections.size,
    });

    // Wait for connections to drain, with timeout
    const deadline = Date.now() + SHUTDOWN_TIMEOUT;
    while (this.activeConnections.size > 0 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }

    if (this.activeConnections.size > 0) {
      this.logger.warn(`Forcing shutdown with ${this.activeConnections.size} active connections`);
    }

    this.logger.info('Server stopped');
  }

  // ─── Route handlers ───

  private handleHealth(_req: Request, res: Response): void {
    const status: HealthStatus = {
      status: 'healthy',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      connections: this.activeConnections.size,
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    };
    res.json(status);
  }

  private async handleListUsers(req: Request, res: Response): Promise<void> {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    // Placeholder: would query database
    res.json({ users: [], page, limit, offset, total: 0 });
  }

  private async handleGetUser(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    if (!id || id.length !== 24) {
      res.status(400).json({ error: 'Invalid user ID format' });
      return;
    }
    res.json({ id, name: 'placeholder' });
  }

  private async handleCreateUser(req: Request, res: Response): Promise<void> {
    const { email, name, role } = req.body;
    if (!email || !name) {
      res.status(400).json({ error: 'Email and name are required' });
      return;
    }
    res.status(201).json({ id: 'new-id', email, name, role: role || 'user' });
  }

  private async handleUpdateUser(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const updates = req.body;
    res.json({ id, ...updates, updatedAt: new Date().toISOString() });
  }

  private async handleDeleteUser(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    this.logger.info('User deleted', { id, deletedBy: (req as any).user?.id });
    res.status(204).send();
  }

  private handleError(err: Error, _req: Request, res: Response, _next: NextFunction): void {
    this.logger.error('Unhandled error', { message: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export default AppServer;
