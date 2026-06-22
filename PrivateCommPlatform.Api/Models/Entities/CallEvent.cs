using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class CallEvent
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CallId { get; set; }
        public Guid? UserId { get; set; }
        public string EventType { get; set; } = null!; // Start, Ring, Accept, Reject, Busy, Connect, Disconnect, End, Mute, Unmute, ConnectionLost, Reconnected, Hold, Resume, DeviceTransfer
        public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
        public string Details { get; set; } = null!;

        public Call Call { get; set; } = null!;
        public User? User { get; set; }
    }
}
