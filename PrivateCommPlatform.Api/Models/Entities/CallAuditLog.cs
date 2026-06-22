using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class CallAuditLog
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CallId { get; set; }
        public Guid ActorId { get; set; }
        public string Action { get; set; } = null!;
        public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
        public string IpAddress { get; set; } = null!;
        public string Details { get; set; } = null!;

        public Call Call { get; set; } = null!;
        public User Actor { get; set; } = null!;
    }
}
