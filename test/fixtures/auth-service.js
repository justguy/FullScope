/**
 * Authentication Service
 * Handles user login, registration, session management, and token refresh.
 *
 * @module auth-service
 * @requires ./db
 * @requires ./config
 * @requires jsonwebtoken
 */

import { db } from './db';
import { config } from './config';
import { hash, verify } from './crypto';
import jwt from 'jsonwebtoken';
import { EventEmitter } from 'events';
import { Logger } from './logger';

// Initialize logger for this module
const logger = new Logger('auth-service');

// Token expiration constants
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

/**
 * AuthService class - manages all authentication operations.
 *
 * Usage:
 *   const auth = new AuthService(db, config);
 *   const { user, tokens } = await auth.login(email, password);
 *
 * Events:
 *   'login' - emitted on successful login
 *   'logout' - emitted on logout
 *   'lockout' - emitted when account is locked
 */
export class AuthService extends EventEmitter {
  /**
   * Create an AuthService instance.
   * @param {Database} database - Database connection
   * @param {Object} config - Configuration object
   * @param {string} config.jwtSecret - Secret for JWT signing
   * @param {number} config.maxAttempts - Max login attempts before lockout
   */
  constructor(database, config) {
    super();
    this.db = database;
    this.config = config;
    this.jwtSecret = config.jwtSecret || 'default-secret';
    this.maxAttempts = config.maxAttempts || MAX_LOGIN_ATTEMPTS;
    this.sessions = new Map();
    this.loginAttempts = new Map();

    // Log initialization
    logger.info('AuthService initialized', {
      maxAttempts: this.maxAttempts,
      accessTokenExpiry: ACCESS_TOKEN_EXPIRY,
      refreshTokenExpiry: REFRESH_TOKEN_EXPIRY,
    });
  }

  /**
   * Register a new user.
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {Object} profile - Additional profile data
   * @returns {Promise<Object>} Created user object
   * @throws {Error} If email is already registered
   */
  async register(email, password, profile = {}) {
    // Validate email format
    if (!this.isValidEmail(email)) {
      throw new Error('Invalid email format');
    }

    // Check for existing user
    const existing = await this.db.users.findOne({ email: email.toLowerCase() });
    if (existing) {
      logger.warn('Registration attempt with existing email', { email });
      throw new Error('Email already registered');
    }

    // Validate password strength
    if (!this.isStrongPassword(password)) {
      throw new Error('Password does not meet requirements');
    }

    // Hash password
    const passwordHash = await hash(password, 12);

    // Create user record
    const user = await this.db.users.create({
      email: email.toLowerCase(),
      passwordHash,
      profile: {
        ...profile,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      status: 'active',
      emailVerified: false,
      loginCount: 0,
      lastLogin: null,
    });

    logger.info('User registered successfully', { userId: user.id, email });

    // Send verification email
    await this.sendVerificationEmail(user);

    return {
      id: user.id,
      email: user.email,
      profile: user.profile,
    };
  }

  /**
   * Authenticate a user with email and password.
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {Object} options - Login options
   * @param {string} options.ipAddress - Client IP for audit
   * @param {string} options.userAgent - Client user agent
   * @returns {Promise<Object>} User data and tokens
   * @throws {Error} If credentials are invalid or account is locked
   */
  async login(email, password, options = {}) {
    const normalizedEmail = email.toLowerCase();

    // Check lockout status
    const attempts = this.loginAttempts.get(normalizedEmail);
    if (attempts && attempts.count >= this.maxAttempts) {
      const timeSinceLockout = Date.now() - attempts.lastAttempt;
      if (timeSinceLockout < LOCKOUT_DURATION) {
        const remainingMs = LOCKOUT_DURATION - timeSinceLockout;
        const remainingMin = Math.ceil(remainingMs / 60000);
        logger.warn('Login attempt on locked account', { email: normalizedEmail });
        this.emit('lockout', { email: normalizedEmail, remainingMin });
        throw new Error(`Account locked. Try again in ${remainingMin} minutes.`);
      }
      // Lockout expired — reset
      this.loginAttempts.delete(normalizedEmail);
    }

    // Find user
    const user = await this.db.users.findOne({ email: normalizedEmail });
    if (!user) {
      this.recordFailedAttempt(normalizedEmail);
      throw new Error('Invalid credentials');
    }

    // Check account status
    if (user.status === 'suspended') {
      throw new Error('Account suspended. Contact support.');
    }

    if (user.status === 'deactivated') {
      throw new Error('Account deactivated');
    }

    // Verify password
    const isValid = await verify(password, user.passwordHash);
    if (!isValid) {
      this.recordFailedAttempt(normalizedEmail);
      logger.warn('Failed login attempt', {
        email: normalizedEmail,
        ipAddress: options.ipAddress,
      });
      throw new Error('Invalid credentials');
    }

    // Clear login attempts on success
    this.loginAttempts.delete(normalizedEmail);

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    // Store session
    const session = {
      userId: user.id,
      refreshToken,
      ipAddress: options.ipAddress || 'unknown',
      userAgent: options.userAgent || 'unknown',
      createdAt: new Date(),
      lastActivity: new Date(),
    };
    this.sessions.set(refreshToken, session);

    // Update user login stats
    await this.db.users.update(user.id, {
      loginCount: (user.loginCount || 0) + 1,
      lastLogin: new Date(),
    });

    logger.info('User logged in', { userId: user.id, email: normalizedEmail });
    this.emit('login', { userId: user.id, email: normalizedEmail });

    return {
      user: {
        id: user.id,
        email: user.email,
        profile: user.profile,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: ACCESS_TOKEN_EXPIRY,
      },
    };
  }

  /**
   * Refresh an access token using a refresh token.
   * @param {string} refreshToken - The refresh token
   * @returns {Promise<Object>} New access token
   * @throws {Error} If refresh token is invalid or expired
   */
  async refreshAccessToken(refreshToken) {
    // Verify the refresh token
    let payload;
    try {
      payload = jwt.verify(refreshToken, this.jwtSecret);
    } catch (err) {
      logger.warn('Invalid refresh token', { error: err.message });
      throw new Error('Invalid or expired refresh token');
    }

    // Check session exists
    const session = this.sessions.get(refreshToken);
    if (!session) {
      throw new Error('Session not found — please log in again');
    }

    // Verify user still exists and is active
    const user = await this.db.users.findById(payload.userId);
    if (!user || user.status !== 'active') {
      this.sessions.delete(refreshToken);
      throw new Error('User account unavailable');
    }

    // Update session activity
    session.lastActivity = new Date();

    // Generate new access token
    const newAccessToken = this.generateAccessToken(user);

    return {
      accessToken: newAccessToken,
      expiresIn: ACCESS_TOKEN_EXPIRY,
    };
  }

  /**
   * Logout a user by invalidating their session.
   * @param {string} refreshToken - The refresh token to invalidate
   */
  async logout(refreshToken) {
    const session = this.sessions.get(refreshToken);
    if (session) {
      logger.info('User logged out', { userId: session.userId });
      this.emit('logout', { userId: session.userId });
      this.sessions.delete(refreshToken);
    }
  }

  /**
   * Verify an access token and return the decoded payload.
   * @param {string} token - JWT access token
   * @returns {Object} Decoded token payload
   * @throws {Error} If token is invalid
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new Error('Token expired');
      }
      throw new Error('Invalid token');
    }
  }

  /**
   * Change a user's password.
   * @param {string} userId - The user's ID
   * @param {string} currentPassword - Current password for verification
   * @param {string} newPassword - New password to set
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await this.db.users.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValid = await verify(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    // Validate new password
    if (!this.isStrongPassword(newPassword)) {
      throw new Error('New password does not meet requirements');
    }

    // Hash and save
    const newHash = await hash(newPassword, 12);
    await this.db.users.update(userId, {
      passwordHash: newHash,
      'profile.updatedAt': new Date(),
    });

    // Invalidate all existing sessions for this user
    for (const [token, session] of this.sessions) {
      if (session.userId === userId) {
        this.sessions.delete(token);
      }
    }

    logger.info('Password changed', { userId });
  }

  // ─── Private helpers ───

  /**
   * Generate a JWT access token for a user.
   * @private
   */
  generateAccessToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        type: 'access',
      },
      this.jwtSecret,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );
  }

  /**
   * Generate a JWT refresh token for a user.
   * @private
   */
  generateRefreshToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        type: 'refresh',
      },
      this.jwtSecret,
      { expiresIn: REFRESH_TOKEN_EXPIRY }
    );
  }

  /**
   * Record a failed login attempt.
   * @private
   */
  recordFailedAttempt(email) {
    const attempts = this.loginAttempts.get(email) || { count: 0, lastAttempt: 0 };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    this.loginAttempts.set(email, attempts);

    logger.warn('Failed login attempt recorded', {
      email,
      attemptCount: attempts.count,
      maxAttempts: this.maxAttempts,
    });
  }

  /**
   * Validate email format.
   * @private
   */
  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /**
   * Check password strength requirements.
   * @private
   * @param {string} password
   * @returns {boolean}
   */
  isStrongPassword(password) {
    // At least 8 chars, one uppercase, one lowercase, one digit
    if (password.length < 8) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[a-z]/.test(password)) return false;
    if (!/\d/.test(password)) return false;
    return true;
  }

  /**
   * Send email verification link.
   * @private
   */
  async sendVerificationEmail(user) {
    const verificationToken = jwt.sign(
      { userId: user.id, type: 'email-verify' },
      this.jwtSecret,
      { expiresIn: '24h' }
    );

    // In production, this would send a real email
    logger.info('Verification email sent', {
      userId: user.id,
      email: user.email,
    });

    return verificationToken;
  }

  /**
   * Get active session count for monitoring.
   */
  getActiveSessionCount() {
    return this.sessions.size;
  }

  /**
   * Clean up expired sessions (should be called periodically).
   */
  cleanupSessions() {
    const now = Date.now();
    let cleaned = 0;
    for (const [token, session] of this.sessions) {
      try {
        jwt.verify(token, this.jwtSecret);
      } catch {
        this.sessions.delete(token);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.info('Cleaned up expired sessions', { count: cleaned });
    }
    return cleaned;
  }
}

export default AuthService;
