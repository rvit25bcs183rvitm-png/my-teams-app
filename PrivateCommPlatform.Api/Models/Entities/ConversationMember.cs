using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class ConversationMember
    {
        public Guid ConversationId { get; set; }
        public Conversation Conversation { get; set; } = null!;
        public Guid UserId { get; set; }
        public User User { get; set; } = null!;
        public string Role { get; set; } = "Member"; // Owner, Admin, Member
        public DateTimeOffset JoinedDate { get; set; } = DateTimeOffset.UtcNow;
        public Guid? LastReadMessageId { get; set; }
    }
}
