using PrivateCommPlatform.Api.Models.Entities;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Services
{
    public interface IMessageService
    {
        Task<Message> SendMessageAsync(Guid senderId, Guid conversationId, string content, string type = "Text", Guid? parentMessageId = null, Guid? forwardedFromMessageId = null);
        Task<Message> EditMessageAsync(Guid userId, Guid messageId, string newContent);
        Task DeleteMessageAsync(Guid userId, Guid messageId, string deleteType = "Everyone");
        Task AddReactionAsync(Guid userId, Guid messageId, string emoji);
        Task RemoveReactionAsync(Guid userId, Guid messageId, string emoji);
        Task MarkAsReadAsync(Guid userId, Guid messageId);
        Task MarkAsDeliveredAsync(Guid userId, Guid messageId);
        Task<bool> IsConversationMemberAsync(Guid conversationId, Guid userId);
    }
}
