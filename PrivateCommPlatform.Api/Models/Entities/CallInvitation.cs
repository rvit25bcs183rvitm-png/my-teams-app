using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class CallInvitation
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CallId { get; set; }
        public Guid InviterId { get; set; }
        public Guid InviteeId { get; set; }
        public string Status { get; set; } = "Pending"; // Pending, Accepted, Rejected, Cancelled, Expired
        public DateTimeOffset SentTime { get; set; } = DateTimeOffset.UtcNow;
        public DateTimeOffset? RespondedTime { get; set; }

        public Call Call { get; set; } = null!;
        public User Inviter { get; set; } = null!;
        public User Invitee { get; set; } = null!;
    }
}
