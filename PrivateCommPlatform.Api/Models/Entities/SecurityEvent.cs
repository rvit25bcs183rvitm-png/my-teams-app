using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class SecurityEvent
    {
        public Guid Id { get; set; }
        public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
        public string EventType { get; set; } = string.Empty; // e.g. BRUTE_FORCE_DETECTED, LOCKOUT
        public string IpAddress { get; set; } = string.Empty;
        public string? Username { get; set; }
        public string Details { get; set; } = string.Empty;
    }
}
