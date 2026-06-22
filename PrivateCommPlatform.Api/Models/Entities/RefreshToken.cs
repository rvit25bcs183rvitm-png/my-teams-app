using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class RefreshToken
    {
        public Guid Id { get; set; }
        public Guid UserId { get; set; }
        public User User { get; set; } = null!;
        public Guid SessionId { get; set; }
        public Session Session { get; set; } = null!;
        public string Token { get; set; } = string.Empty;
        public DateTimeOffset ExpiryDate { get; set; }
        public DateTimeOffset CreatedDate { get; set; } = DateTimeOffset.UtcNow;
        public string CreatedByIp { get; set; } = string.Empty;
        public DateTimeOffset? RevokedDate { get; set; }
        public string? RevokedByIp { get; set; }
        public string? ReplacedByToken { get; set; }

        public bool IsExpired => DateTimeOffset.UtcNow >= ExpiryDate;
        public bool IsRevoked => RevokedDate != null;
        public bool IsActive => !IsRevoked && !IsExpired;
    }
}
