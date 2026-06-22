using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using PrivateCommPlatform.Api.Data;
using PrivateCommPlatform.Api.Models.Entities;
using PrivateCommPlatform.Api.Services;
using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Tests
{
    [TestClass]
    public class SecurityTests
    {
        private ApplicationDbContext GetInMemoryDbContext()
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options;
            return new ApplicationDbContext(options);
        }

        private IConfiguration GetMockConfiguration()
        {
            var inMemorySettings = new Dictionary<string, string?>
            {
                {"Jwt:Secret", "A_Very_Long_Super_Secure_Secret_Key_That_Has_At_Least_256_Bits_Secure!"},
                {"Jwt:Issuer", "PrivateCommPlatform"},
                {"Jwt:Audience", "PrivateCommPlatformClients"},
                {"Jwt:ExpiryMinutes", "15"}
            };

            return new ConfigurationBuilder()
                .AddInMemoryCollection(inMemorySettings)
                .Build();
        }

        [TestMethod]
        public void PasswordHasher_Should_Hash_And_Verify_Argon2id()
        {
            var hasher = new PasswordHasher();
            var password = "SuperSecretPassword123!";

            var hash = hasher.HashPassword(password);
            var isMatch = hasher.VerifyPassword(hash, password);
            var isInvalidMatch = hasher.VerifyPassword(hash, "WrongPassword123!");

            Assert.IsTrue(hash.Contains("argon2id"));
            Assert.IsTrue(isMatch);
            Assert.IsFalse(isInvalidMatch);
        }

        [TestMethod]
        public async Task PasswordValidator_Should_Enforce_Complexity_And_Exclusions()
        {
            var context = GetInMemoryDbContext();
            var hasher = new PasswordHasher();
            var validator = new PasswordValidator(context, hasher);
            var username = "tilak";

            // 1. Too short
            var (isValid1, err1) = await validator.ValidateAsync("Short1!", username);
            Assert.IsFalse(isValid1);
            Assert.IsTrue(err1!.Contains("characters"));

            // 2. Missing uppercase
            var (isValid2, err2) = await validator.ValidateAsync("lowercase123!", username);
            Assert.IsFalse(isValid2);
            Assert.IsTrue(err2!.Contains("uppercase"));

            // 3. Username inclusion
            var (isValid3, err3) = await validator.ValidateAsync("Tilak12345678!", username);
            Assert.IsFalse(isValid3);
            Assert.IsTrue(err3!.Contains("username"));

            // 4. Common password
            var (isValid4, err4) = await validator.ValidateAsync("Password12345!", username);
            Assert.IsFalse(isValid4);
            Assert.IsTrue(err4!.Contains("common"));

            // 5. Valid password
            var (isValid5, err5) = await validator.ValidateAsync("ComplexPassword123!", username);
            Assert.IsTrue(isValid5);
            Assert.IsNull(err5);
        }

        [TestMethod]
        public async Task PasswordValidator_Should_Prevent_Password_Reuse()
        {
            var context = GetInMemoryDbContext();
            var hasher = new PasswordHasher();
            var validator = new PasswordValidator(context, hasher);
            
            var user = new User
            {
                Id = Guid.NewGuid(),
                Username = "user1",
                PasswordHash = hasher.HashPassword("OldPassword123!")
            };
            context.Users.Add(user);

            context.PasswordHistories.Add(new PasswordHistory
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                PasswordHash = hasher.HashPassword("HistoryPassword123!")
            });
            await context.SaveChangesAsync();

            // Try reuse current password
            var (isValidCurrent, errCurrent) = await validator.ValidateAsync("OldPassword123!", user.Username, user.Id);
            Assert.IsFalse(isValidCurrent);
            Assert.IsTrue(errCurrent!.Contains("current"));

            // Try reuse historical password
            var (isValidHistory, errHistory) = await validator.ValidateAsync("HistoryPassword123!", user.Username, user.Id);
            Assert.IsFalse(isValidHistory);
            Assert.IsTrue(errHistory!.Contains("last 5 passwords"));

            // Try new valid password
            var (isValidNew, errNew) = await validator.ValidateAsync("BrandNewPassword123!", user.Username, user.Id);
            Assert.IsTrue(isValidNew);
            Assert.IsNull(errNew);
        }

        [TestMethod]
        public void TokenService_Should_Generate_Valid_Tokens_With_Claims()
        {
            var config = GetMockConfiguration();
            var tokenService = new TokenService(config);

            var user = new User
            {
                Id = Guid.NewGuid(),
                Username = "tilak",
                Email = "tilak@platform.local"
            };
            var role = "Super Administrator";
            var permissions = new[] { "platform:all", "user:all" };
            var sessionId = Guid.NewGuid();

            var accessToken = tokenService.GenerateAccessToken(user, role, permissions, sessionId);
            var principal = tokenService.GetPrincipalFromExpiredToken(accessToken);

            Assert.IsNotNull(accessToken);
            Assert.IsNotNull(principal);
            Assert.AreEqual(user.Id.ToString(), principal.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            Assert.AreEqual(user.Username, principal.FindFirst(ClaimTypes.Name)?.Value);
            Assert.AreEqual(user.Email, principal.FindFirst(ClaimTypes.Email)?.Value);
            Assert.AreEqual(role, principal.FindFirst(ClaimTypes.Role)?.Value);
            Assert.AreEqual(sessionId.ToString(), principal.FindFirst("sid")?.Value);

            var claimPermissions = principal.FindAll("permission");
            var permissionList = new List<string>();
            foreach (var p in claimPermissions)
            {
                permissionList.Add(p.Value);
            }
            Assert.IsTrue(permissionList.Contains("platform:all"));
            Assert.IsTrue(permissionList.Contains("user:all"));
        }

        [TestMethod]
        public void TokenService_Should_Generate_Restricted_Temporary_Tokens()
        {
            var config = GetMockConfiguration();
            var tokenService = new TokenService(config);

            var user = new User
            {
                Id = Guid.NewGuid(),
                Username = "tilak"
            };

            var tempToken = tokenService.GenerateTemporaryToken(user);
            var principal = tokenService.GetPrincipalFromExpiredToken(tempToken);

            Assert.IsNotNull(tempToken);
            Assert.IsNotNull(principal);
            Assert.AreEqual(user.Id.ToString(), principal.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            Assert.AreEqual("password_reset", principal.FindFirst("scope")?.Value);
            Assert.IsNull(principal.FindFirst(ClaimTypes.Role));
        }
    }
}
