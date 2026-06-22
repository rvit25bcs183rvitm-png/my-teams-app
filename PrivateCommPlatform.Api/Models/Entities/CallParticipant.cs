using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class CallParticipant
    {
        public Guid CallId { get; set; }
        public Guid UserId { get; set; }
        public DateTimeOffset JoinedTime { get; set; } = DateTimeOffset.UtcNow;
        public DateTimeOffset? LeftTime { get; set; }
        public string Role { get; set; } = "Receiver"; // Caller, Receiver, Presenter
        public string Status { get; set; } = "Invited"; // Invited, Ringing, Connected, Disconnected, Rejected, Busy, OnHold

        // Navigation properties
        public Call Call { get; set; } = null!;
        public User User { get; set; } = null!;
    }
}
