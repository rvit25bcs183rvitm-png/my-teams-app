using Microsoft.EntityFrameworkCore;
using PrivateCommPlatform.Api.Data;
using PrivateCommPlatform.Api.Models.Entities;
using PrivateCommPlatform.Api.Models.DTOs;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Services
{
    public interface IUserService
    {
        Task<CreateUserResponse> CreateUserAsync(CreateUserRequest request, Guid adminId, string adminUsername);
        Task UpdateUserAsync(Guid userId, UpdateUserRequest request, Guid actorId, string actorUsername);
        Task DeactivateUserAsync(Guid userId, Guid actorId, string actorUsername, string ipAddress);
        Task<string> ResetPasswordAsync(Guid userId, Guid actorId, string actorUsername, string ipAddress);
        Task<IEnumerable<UserDto>> GetUsersAsync();
        Task<UserDto?> GetUserByIdAsync(Guid userId);
    }

    public class UserService : IUserService
    {
        private readonly ApplicationDbContext _dbContext;
        private readonly IPasswordHasher _passwordHasher;
        private readonly ISessionService _sessionService;
        private readonly IAuditService _auditService;

        public UserService(
            ApplicationDbContext dbContext,
            IPasswordHasher passwordHasher,
            ISessionService sessionService,
            IAuditService auditService)
        {
            _dbContext = dbContext;
            _passwordHasher = passwordHasher;
            _sessionService = sessionService;
            _auditService = auditService;
        }

        public async Task<CreateUserResponse> CreateUserAsync(CreateUserRequest request, Guid adminId, string adminUsername)
        {
            var normalizedUsername = request.Username.ToUpperInvariant();

            if (await _dbContext.Users.AnyAsync(u => u.NormalizedUsername == normalizedUsername))
            {
                throw new InvalidOperationException($"Username '{request.Username}' is already taken.");
            }

            var role = await _dbContext.Roles.FirstOrDefaultAsync(r => r.Name == request.RoleName);
            if (role == null)
            {
                throw new InvalidOperationException($"Role '{request.RoleName}' does not exist.");
            }

            string tempPassword = string.IsNullOrWhiteSpace(request.Password) ? GenerateTemporaryPassword() : request.Password;
            string passwordHash = _passwordHasher.HashPassword(tempPassword);

            var user = new User
            {
                Id = Guid.NewGuid(),
                Username = request.Username,
                NormalizedUsername = normalizedUsername,
                DisplayName = request.DisplayName,
                FirstName = request.FirstName,
                LastName = request.LastName,
                Email = request.Email,
                PhoneNumber = request.PhoneNumber,
                Department = request.Department,
                Team = request.Team,
                PasswordHash = passwordHash,
                AccountStatus = "PendingFirstLogin",
                IsTemporaryPassword = true,
                CreatedDate = DateTimeOffset.UtcNow
            };

            user.UserRoles.Add(new UserRole { User = user, Role = role });

            _dbContext.Users.Add(user);
            await _dbContext.SaveChangesAsync();

            var details = System.Text.Json.JsonSerializer.Serialize(new
            {
                Username = user.Username,
                Role = request.RoleName,
                CreatedBy = adminUsername
            });
            await _auditService.LogAuditAsync(adminId, adminUsername, "USER_CREATED", user.Id, details);

            return new CreateUserResponse
            {
                UserId = user.Id,
                Username = user.Username,
                TemporaryPassword = tempPassword
            };
        }

        public async Task UpdateUserAsync(Guid userId, UpdateUserRequest request, Guid actorId, string actorUsername)
        {
            var user = await _dbContext.Users.FindAsync(userId);
            if (user == null)
            {
                throw new KeyNotFoundException("User not found.");
            }

            user.DisplayName = request.DisplayName;
            user.FirstName = request.FirstName;
            user.LastName = request.LastName;
            user.Email = request.Email;
            user.PhoneNumber = request.PhoneNumber;
            user.Department = request.Department;
            user.Team = request.Team;

            await _dbContext.SaveChangesAsync();

            var details = System.Text.Json.JsonSerializer.Serialize(new
            {
                user.DisplayName,
                user.Email,
                user.PhoneNumber,
                user.Department,
                user.Team
            });
            await _auditService.LogAuditAsync(actorId, actorUsername, "USER_UPDATED", user.Id, details);
        }

        public async Task DeactivateUserAsync(Guid userId, Guid actorId, string actorUsername, string ipAddress)
        {
            var user = await _dbContext.Users.FindAsync(userId);
            if (user == null)
            {
                throw new KeyNotFoundException("User not found.");
            }

            user.AccountStatus = "Disabled";
            await _dbContext.SaveChangesAsync();

            var activeSessions = await _dbContext.Sessions
                .Where(s => s.UserId == userId && !s.IsRevoked)
                .ToListAsync();

            foreach (var session in activeSessions)
            {
                await _sessionService.RevokeSessionAsync(session.Id, ipAddress);
            }

            var details = System.Text.Json.JsonSerializer.Serialize(new { DeactivatedBy = actorUsername });
            await _auditService.LogAuditAsync(actorId, actorUsername, "USER_DEACTIVATED", user.Id, details);
        }

        public async Task<string> ResetPasswordAsync(Guid userId, Guid actorId, string actorUsername, string ipAddress)
        {
            var user = await _dbContext.Users.FindAsync(userId);
            if (user == null)
            {
                throw new KeyNotFoundException("User not found.");
            }

            string tempPassword = GenerateTemporaryPassword();
            string passwordHash = _passwordHasher.HashPassword(tempPassword);

            user.PasswordHash = passwordHash;
            user.AccountStatus = "PendingFirstLogin";
            user.IsTemporaryPassword = true;

            await _dbContext.SaveChangesAsync();

            var activeSessions = await _dbContext.Sessions
                .Where(s => s.UserId == userId && !s.IsRevoked)
                .ToListAsync();

            foreach (var session in activeSessions)
            {
                await _sessionService.RevokeSessionAsync(session.Id, ipAddress);
            }

            var details = System.Text.Json.JsonSerializer.Serialize(new { ResetBy = actorUsername });
            await _auditService.LogAuditAsync(actorId, actorUsername, "PASSWORD_RESET", user.Id, details);

            return tempPassword;
        }

        public async Task<IEnumerable<UserDto>> GetUsersAsync()
        {
            return await _dbContext.Users
                .Include(u => u.UserRoles)
                .ThenInclude(ur => ur.Role)
                .Select(u => new UserDto
                {
                    Id = u.Id,
                    Username = u.Username,
                    DisplayName = u.DisplayName,
                    FirstName = u.FirstName,
                    LastName = u.LastName,
                    Email = u.Email,
                    PhoneNumber = u.PhoneNumber,
                    Department = u.Department,
                    Team = u.Team,
                    AccountStatus = u.AccountStatus,
                    CreatedDate = u.CreatedDate,
                    LastLoginDate = u.LastLoginDate,
                    LastActivityDate = u.LastActivityDate,
                    IsTemporaryPassword = u.IsTemporaryPassword,
                    Role = u.UserRoles.Select(ur => ur.Role.Name).FirstOrDefault() ?? string.Empty,
                    SubscriptionPlan = u.SubscriptionPlan,
                    SubscriptionStartDate = u.SubscriptionStartDate,
                    SubscriptionEndDate = u.SubscriptionEndDate
                })
                .ToListAsync();
        }

        public async Task<UserDto?> GetUserByIdAsync(Guid userId)
        {
            var user = await _dbContext.Users
                .AsNoTracking()
                .Include(u => u.UserRoles)
                .ThenInclude(ur => ur.Role)
                .FirstOrDefaultAsync(u => u.Id == userId);

            if (user == null) return null;

            return new UserDto
            {
                Id = user.Id,
                Username = user.Username,
                DisplayName = user.DisplayName,
                FirstName = user.FirstName,
                LastName = user.LastName,
                Email = user.Email,
                PhoneNumber = user.PhoneNumber,
                Department = user.Department,
                Team = user.Team,
                AccountStatus = user.AccountStatus,
                CreatedDate = user.CreatedDate,
                LastLoginDate = user.LastLoginDate,
                LastActivityDate = user.LastActivityDate,
                IsTemporaryPassword = user.IsTemporaryPassword,
                Role = user.UserRoles.Select(ur => ur.Role.Name).FirstOrDefault() ?? string.Empty,
                SubscriptionPlan = user.SubscriptionPlan,
                SubscriptionStartDate = user.SubscriptionStartDate,
                SubscriptionEndDate = user.SubscriptionEndDate
            };
        }

        private string GenerateTemporaryPassword()
        {
            const string uppers = "ABCDEFGHJKLMNOPQRSTUVWXYZ";
            const string lowers = "abcdefghijkmnopqrstuvwxyz";
            const string digits = "0123456789";
            const string specials = "!@#$%^&*()_+-=[]{}|;:,.<>?";

            var randBytes = new byte[16];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(randBytes);
            }

            var password = new char[16];
            password[0] = uppers[randBytes[0] % uppers.Length];
            password[1] = lowers[randBytes[1] % lowers.Length];
            password[2] = digits[randBytes[2] % digits.Length];
            password[3] = specials[randBytes[3] % specials.Length];

            const string allChars = uppers + lowers + digits + specials;
            for (int i = 4; i < 16; i++)
            {
                password[i] = allChars[randBytes[i] % allChars.Length];
            }

            var shuffled = password.OrderBy(c => randBytes[Array.IndexOf(password, c) == -1 ? 0 : Array.IndexOf(password, c) % 16]).ToArray();
            return new string(shuffled);
        }
    }
}
