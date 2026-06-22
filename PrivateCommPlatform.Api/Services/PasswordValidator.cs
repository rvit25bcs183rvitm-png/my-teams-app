using Microsoft.EntityFrameworkCore;
using PrivateCommPlatform.Api.Data;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Services
{
    public interface IPasswordValidator
    {
        Task<(bool IsValid, string? ErrorMessage)> ValidateAsync(string password, string username, Guid? userId = null);
    }

    public class PasswordValidator : IPasswordValidator
    {
        private readonly ApplicationDbContext _dbContext;
        private readonly IPasswordHasher _passwordHasher;

        // Static list of common passwords (disallowed)
        private static readonly string[] CommonPasswords = new[]
        {
            "password12345", "password123456", "123456789012", "qwertyuiopas", 
            "administrator", "superadmin123", "manager12345", "employee12345",
            "family123456", "welcome123456", "letmein123456", "changeme12345"
        };

        public PasswordValidator(ApplicationDbContext dbContext, IPasswordHasher passwordHasher)
        {
            _dbContext = dbContext;
            _passwordHasher = passwordHasher;
        }

        public async Task<(bool IsValid, string? ErrorMessage)> ValidateAsync(string password, string username, Guid? userId = null)
        {
            // 1. Length check
            if (string.IsNullOrEmpty(password) || password.Length < 12)
            {
                return (false, "Password must be at least 12 characters long.");
            }

            // 2. Character class requirements
            bool hasUpper = password.Any(char.IsUpper);
            bool hasLower = password.Any(char.IsLower);
            bool hasDigit = password.Any(char.IsDigit);
            bool hasSpecial = password.Any(ch => !char.IsLetterOrDigit(ch));

            if (!hasUpper || !hasLower || !hasDigit || !hasSpecial)
            {
                return (false, "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.");
            }

            // 3. Username inclusion check (case-insensitive)
            if (!string.IsNullOrEmpty(username) && password.Contains(username, StringComparison.OrdinalIgnoreCase))
            {
                return (false, "Password must not contain the username.");
            }

            // 4. Common passwords check
            if (CommonPasswords.Any(cp => password.Contains(cp, StringComparison.OrdinalIgnoreCase)))
            {
                return (false, "Password is too common and easily guessable.");
            }

            // 5. Password reuse check (if userId is provided)
            if (userId.HasValue)
            {
                // Check current password
                var user = await _dbContext.Users.FindAsync(userId.Value);
                if (user != null && _passwordHasher.VerifyPassword(user.PasswordHash, password))
                {
                    return (false, "Password cannot be the same as your current password.");
                }

                // Check historical passwords
                var history = await _dbContext.PasswordHistories
                    .Where(h => h.UserId == userId.Value)
                    .OrderByDescending(h => h.CreatedDate)
                    .Take(5) // Limit history check to last 5 passwords
                    .ToListAsync();

                foreach (var oldPassword in history)
                {
                    if (_passwordHasher.VerifyPassword(oldPassword.PasswordHash, password))
                    {
                        return (false, "Password cannot be the same as any of your last 5 passwords.");
                    }
                }
            }

            return (true, null);
        }
    }
}
