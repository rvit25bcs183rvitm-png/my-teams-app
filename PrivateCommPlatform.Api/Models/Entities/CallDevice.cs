using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class CallDevice
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CallId { get; set; }
        public Guid UserId { get; set; }
        public string ConnectionId { get; set; } = null!;
        public string DeviceName { get; set; } = null!;
        public string DeviceType { get; set; } = null!;
        public DateTimeOffset JoinedTime { get; set; } = DateTimeOffset.UtcNow;
        public string Status { get; set; } = "Ringing"; // Ringing, Connected, Disconnected

        public Call Call { get; set; } = null!;
        public User User { get; set; } = null!;
    }
}
