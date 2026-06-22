using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PrivateCommPlatform.Api.Data;
using PrivateCommPlatform.Api.Models.DTOs;
using PrivateCommPlatform.Api.Models.Entities;
using PrivateCommPlatform.Api.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly ApplicationDbContext _dbContext;
        private readonly IPasswordHasher _passwordHasher;
        private readonly IPasswordValidator _passwordValidator;
        private readonly ITokenService _tokenService;
        private readonly ISessionService _sessionService;
        private readonly IAuditService _auditService;

        public AuthController(
            ApplicationDbContext dbContext,
            IPasswordHasher passwordHasher,
            IPasswordValidator passwordValidator,
            ITokenService tokenService,
            ISessionService sessionService,
            IAuditService auditService)
        {
            _dbContext = dbContext;
            _passwordHasher = passwordHasher;
            _passwordValidator = passwordValidator;
            _tokenService = tokenService;
            _sessionService = sessionService;
            _auditService = auditService;
        }

        private string GetClientIpAddress() =>
            Request.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "0.0.0.0";

        [HttpPost("login")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status423Locked)]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            var ipAddress = GetClientIpAddress();
            var userAgent = Request.Headers["User-Agent"].ToString();

            var normalizedUsername = request.Username.ToUpperInvariant();
            var user = await _dbContext.Users
                .Include(u => u.UserRoles)
                .ThenInclude(ur => ur.Role)
                .FirstOrDefaultAsync(u => u.NormalizedUsername == normalizedUsername);

            if (user == null)
            {
                // Mitigate user enumeration timing attacks by running a dummy verify
                _passwordHasher.VerifyPassword(
                    "$argon2id$v=19$m=65536,t=4,p=2$Ym9vdHN0cmFwAAAAAA==$expectedhashgoeshereyyyyyyyyyyyy", 
                    request.Password);
                
                await _auditService.LogAuditAsync(null, request.Username, "LOGIN_FAILED", null, "User not found.");
                return BadRequest(new { Error = "Invalid username or password." });
            }

            // Lockout check
            if (user.LockoutEnd.HasValue && user.LockoutEnd.Value > DateTimeOffset.UtcNow)
            {
                var remainingMinutes = Math.Ceiling((user.LockoutEnd.Value - DateTimeOffset.UtcNow).TotalMinutes);
                return StatusCode(StatusCodes.Status423Locked, new { Error = $"Account is temporarily locked. Try again in {remainingMinutes} minutes." });
            }

            // Disabled/Suspended check
            if (user.AccountStatus == "Disabled" || user.AccountStatus == "Suspended")
            {
                return BadRequest(new { Error = "This account is disabled or suspended." });
            }

            // Verify Password
            bool isPasswordCorrect = _passwordHasher.VerifyPassword(user.PasswordHash, request.Password);
            if (!isPasswordCorrect)
            {
                user.FailedLoginAttempts++;
                if (user.FailedLoginAttempts >= 5)
                {
                    user.LockoutEnd = DateTimeOffset.UtcNow.AddMinutes(15);
                    user.FailedLoginAttempts = 0; // Reset count on lockout trigger
                    
                    await _auditService.LogSecurityEventAsync("ACCOUNT_LOCKED", user.Username, "Account locked due to 5 failed login attempts.");
                }

                await _dbContext.SaveChangesAsync();
                await _auditService.LogAuditAsync(user.Id, user.Username, "LOGIN_FAILED", user.Id, "Invalid password provided.");
                return BadRequest(new { Error = "Invalid username or password." });
            }

            // Success: Reset lockout data
            user.FailedLoginAttempts = 0;
            user.LockoutEnd = null;
            user.LastLoginDate = DateTimeOffset.UtcNow;
            await _dbContext.SaveChangesAsync();

            // First login password change flow
            if (user.AccountStatus == "PendingFirstLogin" && user.IsTemporaryPassword)
            {
                var tempToken = _tokenService.GenerateTemporaryToken(user);
                await _auditService.LogAuditAsync(user.Id, user.Username, "FIRST_LOGIN_INITIATED", user.Id, "Temporary password login succeeded. Password reset required.");
                return Ok(new LoginResponse
                {
                    RequiresPasswordChange = true,
                    TempToken = tempToken
                });
            }

            // Standard login success: create session & tokens
            var session = await _sessionService.CreateSessionAsync(user.Id, request.DeviceName, request.DeviceType, ipAddress);
            var refreshTokenString = _tokenService.GenerateRefreshTokenString();

            var refreshToken = new RefreshToken
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                SessionId = session.Id,
                Token = refreshTokenString,
                ExpiryDate = DateTimeOffset.UtcNow.AddDays(7),
                CreatedDate = DateTimeOffset.UtcNow,
                CreatedByIp = ipAddress
            };

            _dbContext.RefreshTokens.Add(refreshToken);
            await _dbContext.SaveChangesAsync();

            var role = user.UserRoles.Select(ur => ur.Role.Name).FirstOrDefault() ?? "Guest";
            var permissions = await _dbContext.RolePermissions
                .Where(rp => rp.RoleId == user.UserRoles.First().RoleId)
                .Select(rp => rp.Permission.Name)
                .ToListAsync();

            var accessToken = _tokenService.GenerateAccessToken(user, role, permissions, session.Id);

            var auditDetails = System.Text.Json.JsonSerializer.Serialize(new { DeviceName = request.DeviceName, DeviceType = request.DeviceType });
            await _auditService.LogAuditAsync(user.Id, user.Username, "LOGIN_SUCCESS", user.Id, auditDetails);

            return Ok(new LoginResponse
            {
                AccessToken = accessToken,
                ExpiresIn = 900, // 15 mins
                RefreshToken = refreshTokenString,
                RequiresPasswordChange = false
            });
        }

        [HttpPost("first-login-change-password")]
        [Authorize]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> FirstLoginChangePassword([FromBody] FirstLoginPasswordChangeRequest request)
        {
            var ipAddress = GetClientIpAddress();

            // Validate that token is temporary password reset token
            var scopeClaim = User.FindFirst("scope")?.Value;
            if (scopeClaim != "password_reset")
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { Error = "Restricted operation. Invalid token scope." });
            }

            var userIdString = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!Guid.TryParse(userIdString, out Guid userId))
            {
                return BadRequest(new { Error = "Invalid token payload." });
            }

            var user = await _dbContext.Users
                .Include(u => u.UserRoles)
                .ThenInclude(ur => ur.Role)
                .FirstOrDefaultAsync(u => u.Id == userId);

            if (user == null || user.AccountStatus != "PendingFirstLogin" || !user.IsTemporaryPassword)
            {
                return BadRequest(new { Error = "User is not in first-login state." });
            }

            // Validate password policy
            var (isValid, errorMessage) = await _passwordValidator.ValidateAsync(request.NewPassword, user.Username, user.Id);
            if (!isValid)
            {
                return BadRequest(new { Error = errorMessage });
            }

            // Update user password and status
            string oldPasswordHash = user.PasswordHash;
            string newPasswordHash = _passwordHasher.HashPassword(request.NewPassword);

            user.PasswordHash = newPasswordHash;
            user.AccountStatus = "Active";
            user.IsTemporaryPassword = false;

            // Save old password to history
            _dbContext.PasswordHistories.Add(new PasswordHistory
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                PasswordHash = oldPasswordHash,
                CreatedDate = DateTimeOffset.UtcNow
            });

            await _dbContext.SaveChangesAsync();

            // Establish session and issue production tokens
            var session = await _sessionService.CreateSessionAsync(user.Id, "Default Client", "Web/Mobile", ipAddress);
            var refreshTokenString = _tokenService.GenerateRefreshTokenString();

            var refreshToken = new RefreshToken
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                SessionId = session.Id,
                Token = refreshTokenString,
                ExpiryDate = DateTimeOffset.UtcNow.AddDays(7),
                CreatedDate = DateTimeOffset.UtcNow,
                CreatedByIp = ipAddress
            };

            _dbContext.RefreshTokens.Add(refreshToken);
            await _dbContext.SaveChangesAsync();

            var role = user.UserRoles.Select(ur => ur.Role.Name).FirstOrDefault() ?? "Guest";
            var permissions = await _dbContext.RolePermissions
                .Where(rp => rp.RoleId == user.UserRoles.First().RoleId)
                .Select(rp => rp.Permission.Name)
                .ToListAsync();

            var accessToken = _tokenService.GenerateAccessToken(user, role, permissions, session.Id);

            await _auditService.LogAuditAsync(user.Id, user.Username, "PASSWORD_CHANGED", user.Id, "First login password change succeeded. Account active.");

            return Ok(new LoginResponse
            {
                AccessToken = accessToken,
                ExpiresIn = 900,
                RefreshToken = refreshTokenString,
                RequiresPasswordChange = false
            });
        }

        [HttpPost("refresh")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> Refresh([FromBody] RefreshRequest request)
        {
            var ipAddress = GetClientIpAddress();

            var dbToken = await _dbContext.RefreshTokens
                .Include(t => t.User)
                .ThenInclude(u => u.UserRoles)
                .ThenInclude(ur => ur.Role)
                .Include(t => t.Session)
                .FirstOrDefaultAsync(t => t.Token == request.RefreshToken);

            if (dbToken == null || !dbToken.IsActive || dbToken.Session.IsRevoked)
            {
                return BadRequest(new { Error = "Invalid or expired refresh token." });
            }

            var user = dbToken.User;
            if (user.AccountStatus == "Disabled" || user.AccountStatus == "Suspended")
            {
                return BadRequest(new { Error = "User account is disabled or suspended." });
            }

            // Revoke current token and generate new rotation pair
            dbToken.RevokedDate = DateTimeOffset.UtcNow;
            dbToken.RevokedByIp = ipAddress;

            var newRefreshTokenString = _tokenService.GenerateRefreshTokenString();
            dbToken.ReplacedByToken = newRefreshTokenString;

            var newRefreshToken = new RefreshToken
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                SessionId = dbToken.SessionId,
                Token = newRefreshTokenString,
                ExpiryDate = DateTimeOffset.UtcNow.AddDays(7),
                CreatedDate = DateTimeOffset.UtcNow,
                CreatedByIp = ipAddress
            };

            _dbContext.RefreshTokens.Add(newRefreshToken);
            await _dbContext.SaveChangesAsync();

            var role = user.UserRoles.Select(ur => ur.Role.Name).FirstOrDefault() ?? "Guest";
            var permissions = await _dbContext.RolePermissions
                .Where(rp => rp.RoleId == user.UserRoles.First().RoleId)
                .Select(rp => rp.Permission.Name)
                .ToListAsync();

            var newAccessToken = _tokenService.GenerateAccessToken(user, role, permissions, dbToken.SessionId);

            return Ok(new LoginResponse
            {
                AccessToken = newAccessToken,
                ExpiresIn = 900,
                RefreshToken = newRefreshTokenString,
                RequiresPasswordChange = false
            });
        }

        [HttpPost("logout")]
        [Authorize]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> Logout([FromBody] RefreshRequest request)
        {
            var ipAddress = GetClientIpAddress();
            var sessionIdClaim = User.FindFirst("sid")?.Value;
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var usernameClaim = User.FindFirst(ClaimTypes.Name)?.Value;

            if (Guid.TryParse(sessionIdClaim, out Guid sessionId) && Guid.TryParse(userIdClaim, out Guid userId))
            {
                await _sessionService.RevokeSessionAsync(sessionId, ipAddress);
                await _auditService.LogAuditAsync(userId, usernameClaim ?? "User", "LOGOUT", userId, "User logged out successfully.");
                return NoContent();
            }

            return BadRequest();
        }
    }
}
