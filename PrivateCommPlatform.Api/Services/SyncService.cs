using Microsoft.EntityFrameworkCore;
using PrivateCommPlatform.Api.Data;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Services
{
    public class SyncService : ISyncService
    {
        private readonly ApplicationDbContext _dbContext;

        public SyncService(ApplicationDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        public async Task<SyncResponseDto> GetSyncDeltasAsync(Guid userId, DateTimeOffset since)
        {
            // Find all conversation IDs the user belongs to
            var conversationIds = await _dbContext.ConversationMembers
                .Where(m => m.UserId == userId)
                .Select(m => m.ConversationId)
                .ToListAsync();

            var response = new SyncResponseDto
            {
                SyncTime = DateTimeOffset.UtcNow
            };

            if (conversationIds.Count == 0)
            {
                return response;
            }

            // 1. New Messages (excluding self-deleted ones)
            response.NewMessages = await _dbContext.Messages
                .Include(m => m.Sender)
                .Where(m => conversationIds.Contains(m.ConversationId) && m.CreatedDate > since)
                .Where(m => !_dbContext.MessageDeletes.Any(d => d.MessageId == m.Id && d.DeletedById == userId && d.DeleteType == "Self"))
                .Select(m => new MessageSyncDto
                {
                    Id = m.Id,
                    ConversationId = m.ConversationId,
                    SenderId = m.SenderId,
                    SenderDisplayName = m.Sender.DisplayName,
                    Type = m.Type,
                    Content = m.Content,
                    CreatedDate = m.CreatedDate,
                    ParentMessageId = m.ParentMessageId,
                    ForwardedFromMessageId = m.ForwardedFromMessageId,
                    IsEdited = m.IsEdited,
                    IsDeleted = m.IsDeleted
                })
                .ToListAsync();

            // 2. Message Edits
            response.Edits = await _dbContext.MessageEdits
                .Include(e => e.Message)
                .Where(e => conversationIds.Contains(e.Message.ConversationId) && e.EditedDate > since)
                .Select(e => new MessageEditSyncDto
                {
                    MessageId = e.MessageId,
                    ConversationId = e.Message.ConversationId,
                    NewContent = e.Message.Content,
                    EditedDate = e.EditedDate
                })
                .ToListAsync();

            // 3. Message Deletions
            response.Deletions = await _dbContext.MessageDeletes
                .Include(d => d.Message)
                .Where(d => d.DeletedDate > since && (
                    (d.DeleteType == "Everyone" && conversationIds.Contains(d.Message.ConversationId)) ||
                    (d.DeleteType == "Self" && d.DeletedById == userId)
                ))
                .Select(d => new MessageDeleteSyncDto
                {
                    MessageId = d.MessageId,
                    ConversationId = d.Message.ConversationId,
                    DeleteType = d.DeleteType,
                    DeletedById = d.DeletedById,
                    DeletedDate = d.DeletedDate
                })
                .ToListAsync();

            // 4. Reactions
            response.Reactions = await _dbContext.Reactions
                .Include(r => r.Message)
                .Where(r => conversationIds.Contains(r.Message.ConversationId) && r.CreatedDate > since)
                .Select(r => new ReactionSyncDto
                {
                    MessageId = r.MessageId,
                    ConversationId = r.Message.ConversationId,
                    UserId = r.UserId,
                    Emoji = r.Emoji,
                    CreatedDate = r.CreatedDate,
                    IsAdded = true
                })
                .ToListAsync();

            // 5. Read Receipts
            response.ReadReceipts = await _dbContext.ReadReceipts
                .Include(r => r.Message)
                .Where(r => conversationIds.Contains(r.Message.ConversationId) && r.ReadTime > since)
                .Select(r => new ReadReceiptSyncDto
                {
                    MessageId = r.MessageId,
                    ConversationId = r.Message.ConversationId,
                    UserId = r.UserId,
                    ReadTime = r.ReadTime
                })
                .ToListAsync();

            // 6. Delivery Receipts
            response.DeliveryReceipts = await _dbContext.DeliveryReceipts
                .Include(r => r.Message)
                .Where(r => conversationIds.Contains(r.Message.ConversationId) && r.DeliveryTime > since)
                .Select(r => new DeliveryReceiptSyncDto
                {
                    MessageId = r.MessageId,
                    ConversationId = r.Message.ConversationId,
                    UserId = r.UserId,
                    DeliveryTime = r.DeliveryTime
                })
                .ToListAsync();

            return response;
        }
    }
}
