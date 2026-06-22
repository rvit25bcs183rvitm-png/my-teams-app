using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class AuditLog
    {
        public Guid Id { get; set; }
        public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
        public Guid? ActorId { get; set; }
        public string ActorUsername { get; set; } = string.Empty;
        public string Action { get; set; } = string.Empty;
        public Guid? TargetId { get; set; }
        public string IpAddress { get; set; } = string.Empty;
        public string? UserAgent { get; set; }
        public string Details { get; set; } = string.Empty; // JSON details
    }
}
