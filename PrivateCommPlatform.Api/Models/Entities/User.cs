using System;
using System.Collections.Generic;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class User
    {
        public Guid Id { get; set; }
        public string Username { get; set; } = string.Empty;
        public string NormalizedUsername { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string? PhoneNumber { get; set; }
        public string? Department { get; set; }
        public string? Team { get; set; }
        public byte[]? ProfilePhoto { get; set; }
        public string PasswordHash { get; set; } = string.Empty;
        public string AccountStatus { get; set; } = "PendingFirstLogin"; // PendingFirstLogin, Active, Suspended, Disabled
        public int FailedLoginAttempts { get; set; }
        public DateTimeOffset? LockoutEnd { get; set; }
        public DateTimeOffset CreatedDate { get; set; } = DateTimeOffset.UtcNow;
        public DateTimeOffset? LastLoginDate { get; set; }
        public DateTimeOffset? LastActivityDate { get; set; }
        public bool IsTemporaryPassword { get; set; } = true;

        // Billing & Subscriptions
        public string? RazorpayCustomerId { get; set; }
        public string SubscriptionPlan { get; set; } = "Free"; // Free, UsageBased, BusinessPro
        public string SubscriptionStatus { get; set; } = "Active"; // Active, PastDue, Canceled
        public DateTime? SubscriptionStartDate { get; set; }
        public DateTime? SubscriptionEndDate { get; set; }
        public string? CountryCode { get; set; }
        public string? Currency { get; set; }
        public int MonthlyCallCount { get; set; } = 0;
        public DateTimeOffset? CurrentBillingCycleStart { get; set; }

        public ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();
        public ICollection<Session> Sessions { get; set; } = new List<Session>();
        public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
        public ICollection<PasswordHistory> PasswordHistories { get; set; } = new List<PasswordHistory>();
    }
}
