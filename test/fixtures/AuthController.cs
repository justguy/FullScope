using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Example.Auth
{
    /// <summary>
    /// Authentication controller.
    /// Handles login, registration, and token refresh.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IUserRepository _userRepository;
        private readonly ITokenService _tokenService;
        private readonly IPasswordHasher _passwordHasher;
        private readonly ILogger<AuthController> _logger;

        /// <summary>
        /// Creates a new AuthController instance.
        /// </summary>
        public AuthController(
            IUserRepository userRepository,
            ITokenService tokenService,
            IPasswordHasher passwordHasher,
            ILogger<AuthController> logger)
        {
            _userRepository = userRepository;
            _tokenService = tokenService;
            _passwordHasher = passwordHasher;
            _logger = logger;
        }

        /// <summary>
        /// POST /api/auth/login
        /// </summary>
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Email))
            {
                return BadRequest(new { error = "Email is required" });
            }

            var user = await _userRepository.FindByEmailAsync(request.Email.ToLower());
            if (user == null)
            {
                _logger.LogWarning("Login attempt for non-existent email: {Email}", request.Email);
                return Unauthorized(new { error = "Invalid credentials" });
            }

            if (user.Status == UserStatus.Locked)
            {
                return Unauthorized(new { error = "Account is locked" });
            }

            if (!_passwordHasher.Verify(request.Password, user.PasswordHash))
            {
                user.FailedAttempts++;
                if (user.FailedAttempts >= 5)
                {
                    user.Status = UserStatus.Locked;
                    _logger.LogWarning("Account locked: {UserId}", user.Id);
                }
                await _userRepository.SaveAsync(user);
                return Unauthorized(new { error = "Invalid credentials" });
            }

            // Success — reset attempts and generate tokens
            user.FailedAttempts = 0;
            user.LastLogin = DateTime.UtcNow;
            await _userRepository.SaveAsync(user);

            var accessToken = _tokenService.GenerateAccessToken(user);
            var refreshToken = _tokenService.GenerateRefreshToken(user);

            _logger.LogInformation("User logged in: {UserId}", user.Id);

            return Ok(new
            {
                userId = user.Id,
                accessToken,
                refreshToken,
            });
        }

        /// <summary>
        /// POST /api/auth/register
        /// </summary>
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest request)
        {
            var existing = await _userRepository.FindByEmailAsync(request.Email.ToLower());
            if (existing != null)
            {
                return Conflict(new { error = "Email already registered" });
            }

            var hashedPassword = _passwordHasher.Hash(request.Password);
            var user = new User
            {
                Email = request.Email.ToLower(),
                PasswordHash = hashedPassword,
                Name = request.Name,
                Status = UserStatus.Active,
                CreatedAt = DateTime.UtcNow,
            };

            await _userRepository.SaveAsync(user);
            _logger.LogInformation("User registered: {Email}", user.Email);

            return CreatedAtAction(nameof(Login), new { id = user.Id }, new { userId = user.Id });
        }

        /// <summary>
        /// POST /api/auth/refresh
        /// </summary>
        [HttpPost("refresh")]
        public async Task<IActionResult> Refresh([FromBody] RefreshRequest request)
        {
            var claims = _tokenService.ValidateRefreshToken(request.RefreshToken);
            if (claims == null)
            {
                return Unauthorized(new { error = "Invalid refresh token" });
            }

            var user = await _userRepository.FindByIdAsync(claims.UserId);
            if (user == null || user.Status != UserStatus.Active)
            {
                return Unauthorized(new { error = "User not found or inactive" });
            }

            var newAccessToken = _tokenService.GenerateAccessToken(user);
            return Ok(new { accessToken = newAccessToken });
        }
    }

    #region Request models

    public class LoginRequest
    {
        public string Email { get; set; }
        public string Password { get; set; }
    }

    public class RegisterRequest
    {
        public string Email { get; set; }
        public string Password { get; set; }
        public string Name { get; set; }
    }

    public class RefreshRequest
    {
        public string RefreshToken { get; set; }
    }

    #endregion
}
