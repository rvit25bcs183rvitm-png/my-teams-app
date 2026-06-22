using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Services
{
    public class SyncResponseDto
    {
        public DateTimeOffset SyncTime { get; set; }
        public List<MessageSyncDto> NewMessages { get; set; } = new();
        public List<MessageEditSyncDto> Edits { get; set; } = new();
        public List<MessageDeleteSyncDto> Deletions { get; set; } = new();
        public List<ReactionSyncDto> Reactions { get; set; } = new();
        public List<ReadReceiptSyncDto> ReadReceipts { get; set; } = new();
        public List<DeliveryReceiptSyncDto> DeliveryReceipts { get; set; } = new();
    }

    public class MessageSyncDto
    {
        public Guid Id { get; set; }
        public Guid ConversationId { get; set; }
        public Guid SenderId { get; set; }
        public string SenderDisplayName { get; set; } = string.Empty;
        public string Type { get; set; } = "Text";
        public string Content { get; set; } = string.Empty;
        public DateTimeOffset CreatedDate { get; set; }
        public Guid? ParentMessageId { get; set; }
        public Guid? ForwardedFromMessageId { get; set; }
        public bool IsEdited { get; set; }
        public bool IsDeleted { get; set; }
    }

    public class MessageEditSyncDto
    {
        public Guid MessageId { get; set; }
        public Guid ConversationId { get; set; }
        public string NewContent { get; set; } = string.Empty;
        public DateTimeOffset EditedDate { get; set; }
    }

    public class MessageDeleteSyncDto
    {
        public Guid MessageId { get; set; }
        public Guid ConversationId { get; set; }
        public string DeleteType { get; set; } = "Everyone"; // Everyone, Self
        public Guid DeletedById { get; set; }
        public DateTimeOffset DeletedDate { get; set; }
    }

    public class ReactionSyncDto
    {
        public Guid MessageId { get; set; }
        public Guid ConversationId { get; set; }
        public Guid UserId { get; set; }
        public string Emoji { get; set; } = string.Empty;
        public DateTimeOffset CreatedDate { get; set; }
        public bool IsAdded { get; set; } = true; // True for add, false if we track removal (optional, but good)
    }

    public class ReadReceiptSyncDto
    {
        public Guid MessageId { get; set; }
        public Guid ConversationId { get; set; }
        public Guid UserId { get; set; }
        public DateTimeOffset ReadTime { get; set; }
    }

    public class DeliveryReceiptSyncDto
    {
        public Guid MessageId { get; set; }
        public Guid ConversationId { get; set; }
        public Guid UserId { get; set; }
        public DateTimeOffset DeliveryTime { get; set; }
    }

    public interface ISyncService
    {
        Task<SyncResponseDto> GetSyncDeltasAsync(Guid userId, DateTimeOffset since);
    }
}
