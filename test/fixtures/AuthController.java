package com.example.auth;

import java.util.Map;
import java.util.HashMap;
import java.util.Optional;
import java.time.Instant;

/**
 * Authentication controller.
 * Handles login, registration, and token validation endpoints.
 *
 * @author example
 * @version 1.0
 */
public class AuthController {

    private final UserRepository userRepository;
    private final TokenService tokenService;
    private final PasswordEncoder passwordEncoder;

    /**
     * Create a new AuthController.
     *
     * @param userRepository user data access
     * @param tokenService JWT token operations
     * @param passwordEncoder password hashing
     */
    public AuthController(
            UserRepository userRepository,
            TokenService tokenService,
            PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.tokenService = tokenService;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * Handle POST /auth/login.
     *
     * @param email user email
     * @param password user password
     * @return authentication result with tokens
     * @throws AuthException if credentials are invalid
     */
    public AuthResult login(String email, String password) throws AuthException {
        // Validate input
        if (email == null || email.isBlank()) {
            throw new AuthException("Email is required");
        }
        if (password == null || password.length() < 8) {
            throw new AuthException("Password must be at least 8 characters");
        }

        // Find user
        Optional<User> userOpt = userRepository.findByEmail(email.toLowerCase());
        if (userOpt.isEmpty()) {
            throw new AuthException("Invalid credentials");
        }

        User user = userOpt.get();

        // Check account status
        if (user.getStatus() == UserStatus.LOCKED) {
            throw new AuthException("Account is locked");
        }

        // Verify password
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            user.incrementFailedAttempts();
            if (user.getFailedAttempts() >= 5) {
                user.setStatus(UserStatus.LOCKED);
            }
            userRepository.save(user);
            throw new AuthException("Invalid credentials");
        }

        // Reset failed attempts on successful login
        user.resetFailedAttempts();
        user.setLastLogin(Instant.now());
        userRepository.save(user);

        // Generate tokens
        String accessToken = tokenService.generateAccessToken(user);
        String refreshToken = tokenService.generateRefreshToken(user);

        return new AuthResult(user.getId(), accessToken, refreshToken);
    }

    /**
     * Handle POST /auth/register.
     */
    public User register(String email, String password, String name) throws AuthException {
        if (userRepository.findByEmail(email.toLowerCase()).isPresent()) {
            throw new AuthException("Email already registered");
        }

        String hashedPassword = passwordEncoder.encode(password);
        User user = new User(email.toLowerCase(), hashedPassword, name);
        return userRepository.save(user);
    }

    /**
     * Handle POST /auth/refresh.
     */
    public AuthResult refreshToken(String refreshToken) throws AuthException {
        TokenClaims claims = tokenService.validateRefreshToken(refreshToken);
        if (claims == null) {
            throw new AuthException("Invalid refresh token");
        }

        Optional<User> userOpt = userRepository.findById(claims.getUserId());
        if (userOpt.isEmpty()) {
            throw new AuthException("User not found");
        }

        User user = userOpt.get();
        String newAccessToken = tokenService.generateAccessToken(user);
        return new AuthResult(user.getId(), newAccessToken, refreshToken);
    }

    /**
     * Validate an access token.
     */
    public TokenClaims validateToken(String token) {
        return tokenService.validateAccessToken(token);
    }
}
