using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class PasswordHistory
    {
        public Guid Id { get; set; }
        public Guid UserId { get; set; }
        public User User { get; set; } = null!;
        public string PasswordHash { get; set; } = string.Empty;
        public DateTimeOffset CreatedDate { get; set; } = DateTimeOffset.UtcNow;
    }
}
