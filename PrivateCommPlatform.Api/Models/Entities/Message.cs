using System;
using System.Collections.Generic;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class Message
    {
        public Guid Id { get; set; }
        public Guid ConversationId { get; set; }
        public Conversation Conversation { get; set; } = null!;
        public Guid SenderId { get; set; }
        public User Sender { get; set; } = null!;
        public string Type { get; set; } = "Text"; // Text, RichText, Attachment, System
        public string Content { get; set; } = string.Empty;
        public DateTimeOffset CreatedDate { get; set; } = DateTimeOffset.UtcNow;
        public Guid? ParentMessageId { get; set; }
        public Message? ParentMessage { get; set; }
        public Guid? ForwardedFromMessageId { get; set; }
        public Message? ForwardedFromMessage { get; set; }
        public bool IsEdited { get; set; }
        public bool IsDeleted { get; set; }

        public ICollection<Attachment> Attachments { get; set; } = new List<Attachment>();
        public ICollection<Reaction> Reactions { get; set; } = new List<Reaction>();
        public ICollection<ReadReceipt> ReadReceipts { get; set; } = new List<ReadReceipt>();
        public ICollection<DeliveryReceipt> DeliveryReceipts { get; set; } = new List<DeliveryReceipt>();
        public ICollection<Mention> Mentions { get; set; } = new List<Mention>();
        public ICollection<MessageEdit> Edits { get; set; } = new List<MessageEdit>();
        public MessageDelete? DeleteLog { get; set; }
    }
}
