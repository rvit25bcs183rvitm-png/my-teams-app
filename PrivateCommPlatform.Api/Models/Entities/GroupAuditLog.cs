using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class GroupAuditLog
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid ConversationId { get; set; }
        public Guid ActorId { get; set; }
        public string EventType { get; set; } = null!; // MemberAdded, MemberRemoved, RoleChanged, SettingsChanged
        public string Details { get; set; } = null!;
        public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
    }
}
