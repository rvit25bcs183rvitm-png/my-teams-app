using System;
using System.Collections.Generic;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class Conversation
    {
        public Guid Id { get; set; }
        public string Type { get; set; } = "DirectMessage"; // DirectMessage, GroupChat, Channel
        public string? Name { get; set; }
        public Guid? CreatedById { get; set; }
        public User? CreatedBy { get; set; }
        public DateTimeOffset CreatedDate { get; set; } = DateTimeOffset.UtcNow;
        public bool IsArchived { get; set; }
        public DateTimeOffset? ArchivedDate { get; set; }

        public Guid? ParentId { get; set; }
        public Conversation? Parent { get; set; }
        public ICollection<Conversation> SubChannels { get; set; } = new List<Conversation>();

        public ICollection<ConversationMember> Members { get; set; } = new List<ConversationMember>();
        public ICollection<Message> Messages { get; set; } = new List<Message>();
        public ConversationSetting? Settings { get; set; }
    }
}
