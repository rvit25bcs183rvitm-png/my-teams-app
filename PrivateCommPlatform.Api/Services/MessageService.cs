using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using PrivateCommPlatform.Api.Data;
using PrivateCommPlatform.Api.Hubs;
using PrivateCommPlatform.Api.Models.Entities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Services
{
    public class MessageService : IMessageService
    {
        private readonly ApplicationDbContext _dbContext;
        private readonly IHubContext<ChatHub> _hubContext;
        private static readonly HashSet<string> ValidEmojis = new() { "👍", "❤️", "😂", "😮", "🎉", "👏" };

        public MessageService(ApplicationDbContext dbContext, IHubContext<ChatHub> hubContext)
        {
            _dbContext = dbContext;
            _hubContext = hubContext;
        }

        public async Task<bool> IsConversationMemberAsync(Guid conversationId, Guid userId)
        {
            return await _dbContext.ConversationMembers
                .AnyAsync(m => m.ConversationId == conversationId && m.UserId == userId);
        }

        public async Task<Message> SendMessageAsync(Guid senderId, Guid conversationId, string content, string type = "Text", Guid? parentMessageId = null, Guid? forwardedFromMessageId = null)
        {
            // Verify membership
            var member = await _dbContext.ConversationMembers
                .AsNoTracking()
                .FirstOrDefaultAsync(m => m.ConversationId == conversationId && m.UserId == senderId);
            if (member == null)
            {
                throw new UnauthorizedAccessException("You are not a member of this conversation.");
            }

            // Get conversation details to check posting restrictions
            var conversation = await _dbContext.Conversations
                .AsNoTracking()
                .Include(c => c.Settings)
                .FirstOrDefaultAsync(c => c.Id == conversationId);

            if (conversation?.Type != "DirectMessage")
            {
                var postingRestriction = conversation?.Settings?.PostingRestriction ?? "AnyMember";
                bool isAllowed = false;

                if (member.Role == "Owner")
                {
                    isAllowed = true;
                }
                else if (member.Role == "Manager")
                {
                    isAllowed = postingRestriction != "OnlyOwners";
                }
                else if (member.Role == "Employee")
                {
                    isAllowed = postingRestriction == "AnyMember";
                }

                if (!isAllowed)
                {
                    throw new UnauthorizedAccessException("You do not have permission to post messages in this channel.");
                }
            }

            // Create message
            var message = new Message
            {
                Id = Guid.NewGuid(),
                ConversationId = conversationId,
                SenderId = senderId,
                Type = type,
                Content = content,
                CreatedDate = DateTimeOffset.UtcNow,
                ParentMessageId = parentMessageId,
                ForwardedFromMessageId = forwardedFromMessageId
            };

            _dbContext.Messages.Add(message);

            // Parse @username mentions
            var mentions = ParseMentions(content);
            foreach (var username in mentions)
            {
                var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.NormalizedUsername == username.ToUpperInvariant());
                if (user != null)
                {
                    // Verify that the mentioned user is a member of this conversation
                    var isMember = await IsConversationMemberAsync(conversationId, user.Id);
                    if (isMember)
                    {
                        var mention = new Mention
                        {
                            MessageId = message.Id,
                            UserId = user.Id,
                            CreatedDate = DateTimeOffset.UtcNow
                        };
                        _dbContext.Mentions.Add(mention);
                        message.Mentions.Add(mention);
                    }
                }
            }

            await _dbContext.SaveChangesAsync();

            // Load Sender display info for client ease of use
            await _dbContext.Entry(message).Reference(m => m.Sender).LoadAsync();

            var messagePayload = new
            {
                message.Id,
                message.ConversationId,
                message.SenderId,
                SenderDisplayName = message.Sender.DisplayName,
                message.Type,
                message.Content,
                message.CreatedDate,
                message.ParentMessageId,
                message.ForwardedFromMessageId,
                message.IsEdited,
                message.IsDeleted
            };

            // Broadcast to conversation group (for clients that joined)
            await _hubContext.Clients.Group($"conversation:{conversationId}")
                .SendAsync("ReceiveMessage", messagePayload);

            // Also broadcast to each member's personal user group for reliable delivery
            var memberUserIds = await _dbContext.ConversationMembers
                .Where(m => m.ConversationId == conversationId)
                .Select(m => m.UserId)
                .ToListAsync();

            foreach (var memberId in memberUserIds)
            {
                await _hubContext.Clients.Group($"user:{memberId}")
                    .SendAsync("ReceiveMessage", messagePayload);
            }

            return message;
        }

        public async Task<Message> EditMessageAsync(Guid userId, Guid messageId, string newContent)
        {
            var message = await _dbContext.Messages
                .Include(m => m.Conversation)
                .FirstOrDefaultAsync(m => m.Id == messageId);

            if (message == null)
            {
                throw new KeyNotFoundException("Message not found.");
            }

            // Check EditRestriction setting
            var member = await _dbContext.ConversationMembers
                .AsNoTracking()
                .FirstOrDefaultAsync(m => m.ConversationId == message.ConversationId && m.UserId == userId);
            if (member == null)
            {
                throw new UnauthorizedAccessException("You are not a member of this conversation.");
            }

            if (message.Conversation.Type != "DirectMessage")
            {
                var editRestriction = message.Conversation.Settings?.EditRestriction ?? "OnlyOwnersAndManagers";
                bool isAllowed = false;

                if (member.Role == "Owner")
                {
                    isAllowed = true;
                }
                else if (member.Role == "Manager")
                {
                    isAllowed = editRestriction != "OnlyOwners";
                }
                else
                {
                    // Employee/Guest can only edit if it is their own message AND editRestriction is AnyMember (which edit restrictions don't have, they default to OnlyOwnersAndManagers)
                    isAllowed = false;
                }

                if (!isAllowed)
                {
                    throw new UnauthorizedAccessException("You do not have permission to edit messages in this channel.");
                }
            }

            if (message.SenderId != userId)
            {
                throw new UnauthorizedAccessException("You can only edit your own messages.");
            }

            // Enforce edit grace period of 15 minutes
            if (DateTimeOffset.UtcNow - message.CreatedDate > TimeSpan.FromMinutes(15))
            {
                throw new InvalidOperationException("Messages can only be edited within 15 minutes of creation.");
            }

            if (message.IsDeleted)
            {
                throw new InvalidOperationException("Cannot edit a deleted message.");
            }

            // Save original content in audit edit log
            var editLog = new MessageEdit
            {
                Id = Guid.NewGuid(),
                MessageId = message.Id,
                OriginalContent = message.Content,
                EditedDate = DateTimeOffset.UtcNow
            };
            _dbContext.MessageEdits.Add(editLog);

            message.Content = newContent;
            message.IsEdited = true;

            await _dbContext.SaveChangesAsync();

            // Broadcast edit update to conversation group
            await _hubContext.Clients.Group($"conversation:{message.ConversationId}")
                .SendAsync("MessageEdited", message.Id, message.ConversationId, newContent);

            // Also broadcast to each member's personal user group
            var editMemberIds = await _dbContext.ConversationMembers
                .Where(m => m.ConversationId == message.ConversationId)
                .Select(m => m.UserId)
                .ToListAsync();
            foreach (var mid in editMemberIds)
            {
                await _hubContext.Clients.Group($"user:{mid}")
                    .SendAsync("MessageEdited", message.Id, message.ConversationId, newContent);
            }

            return message;
        }

        public async Task DeleteMessageAsync(Guid userId, Guid messageId, string deleteType = "Everyone")
        {
            var message = await _dbContext.Messages
                .Include(m => m.Conversation)
                .FirstOrDefaultAsync(m => m.Id == messageId);

            if (message == null)
            {
                throw new KeyNotFoundException("Message not found.");
            }

            // Get caller's role in the conversation
            var callerMember = await _dbContext.ConversationMembers
                .AsNoTracking()
                .FirstOrDefaultAsync(m => m.ConversationId == message.ConversationId && m.UserId == userId);
            
            if (callerMember == null)
            {
                throw new UnauthorizedAccessException("You are not a member of this conversation.");
            }

            // If it's a DM, standard logic (sender or global admin)
            if (message.Conversation.Type != "DirectMessage")
            {
                // Retrieve Settings
                var conversation = await _dbContext.Conversations
                    .AsNoTracking()
                    .Include(c => c.Settings)
                    .FirstOrDefaultAsync(c => c.Id == message.ConversationId);
                var deleteRestriction = conversation?.Settings?.DeleteRestriction ?? "OwnOrHigher";

                bool isAllowed = false;
                var targetMember = await _dbContext.ConversationMembers
                    .AsNoTracking()
                    .FirstOrDefaultAsync(m => m.ConversationId == message.ConversationId && m.UserId == message.SenderId);
                var targetRole = targetMember?.Role ?? "Employee";

                if (callerMember.Role == "Owner")
                {
                    isAllowed = true; // Owner can delete anything
                }
                else if (callerMember.Role == "Manager")
                {
                    // Manager can delete anything except Owner's messages
                    isAllowed = targetRole != "Owner";
                }
                else // Employee or Guest
                {
                    // Can delete own message only if DeleteRestriction is OwnOrHigher
                    isAllowed = (message.SenderId == userId) && (deleteRestriction == "OwnOrHigher");
                }

                if (!isAllowed)
                {
                    throw new UnauthorizedAccessException("You do not have permission to delete this message.");
                }
            }
            else
            {
                // DMs: sender or global admin
                var isSender = message.SenderId == userId;
                var isAdmin = await IsUserAdminAsync(userId);
                if (!isSender && !isAdmin)
                {
                    throw new UnauthorizedAccessException("You are not authorized to delete this message.");
                }
            }

            if (deleteType.Equals("Everyone", StringComparison.OrdinalIgnoreCase))
            {
                if (message.IsDeleted)
                {
                    return;
                }

                // Delete for everyone
                message.IsDeleted = true;
                message.Content = "This message was deleted";
                
                // Clear attachments physically/metadata wise if needed, or let DB cascade delete
                // For simplicity, we just mark as deleted and replace content
                
                var deleteLog = new MessageDelete
                {
                    MessageId = message.Id,
                    DeletedById = userId,
                    DeletedDate = DateTimeOffset.UtcNow,
                    DeleteType = "Everyone"
                };
                _dbContext.MessageDeletes.Add(deleteLog);

                await _dbContext.SaveChangesAsync();

                // Broadcast deletion to all users in conversation
                await _hubContext.Clients.Group($"conversation:{message.ConversationId}")
                    .SendAsync("MessageDeleted", message.Id, message.ConversationId, "Everyone");

                // Also broadcast to each member's personal user group
                var delMemberIds = await _dbContext.ConversationMembers
                    .Where(m => m.ConversationId == message.ConversationId)
                    .Select(m => m.UserId)
                    .ToListAsync();
                foreach (var mid in delMemberIds)
                {
                    await _hubContext.Clients.Group($"user:{mid}")
                        .SendAsync("MessageDeleted", message.Id, message.ConversationId, "Everyone");
                }
            }
            else
            {
                // Delete for self only: does not modify message content, just adds delete log for user
                var alreadyDeletedForSelf = await _dbContext.MessageDeletes
                    .AnyAsync(d => d.MessageId == messageId && d.DeletedById == userId && d.DeleteType == "Self");

                if (!alreadyDeletedForSelf)
                {
                    var deleteLog = new MessageDelete
                    {
                        MessageId = message.Id,
                        DeletedById = userId,
                        DeletedDate = DateTimeOffset.UtcNow,
                        DeleteType = "Self"
                    };
                    _dbContext.MessageDeletes.Add(deleteLog);
                    await _dbContext.SaveChangesAsync();
                }

                // Broadcast deletion to user's devices only
                await _hubContext.Clients.Group($"user:{userId}")
                    .SendAsync("MessageDeleted", message.Id, message.ConversationId, "Self");
            }
        }

        public async Task AddReactionAsync(Guid userId, Guid messageId, string emoji)
        {
            if (!ValidEmojis.Contains(emoji))
            {
                throw new ArgumentException($"Invalid emoji reaction. Allowed: {string.Join(", ", ValidEmojis)}");
            }

            var message = await _dbContext.Messages
                .Include(m => m.Conversation)
                .FirstOrDefaultAsync(m => m.Id == messageId);

            if (message == null)
            {
                throw new KeyNotFoundException("Message not found.");
            }

            if (!await IsConversationMemberAsync(message.ConversationId, userId))
            {
                throw new UnauthorizedAccessException("You are not a member of this conversation.");
            }

            // Prevent duplicate reactions by same user
            var exists = await _dbContext.Reactions
                .AnyAsync(r => r.MessageId == messageId && r.UserId == userId && r.Emoji == emoji);

            if (exists)
            {
                throw new InvalidOperationException("You have already reacted with this emoji.");
            }

            var reaction = new Reaction
            {
                Id = Guid.NewGuid(),
                MessageId = messageId,
                UserId = userId,
                Emoji = emoji,
                CreatedDate = DateTimeOffset.UtcNow
            };

            _dbContext.Reactions.Add(reaction);
            await _dbContext.SaveChangesAsync();

            // Broadcast reaction added
            await _hubContext.Clients.Group($"conversation:{message.ConversationId}")
                .SendAsync("ReactionAdded", messageId, message.ConversationId, userId, emoji);

            // Also broadcast to each member's personal user group
            var reactMemberIds = await _dbContext.ConversationMembers
                .Where(m => m.ConversationId == message.ConversationId)
                .Select(m => m.UserId)
                .ToListAsync();
            foreach (var mid in reactMemberIds)
            {
                await _hubContext.Clients.Group($"user:{mid}")
                    .SendAsync("ReactionAdded", messageId, message.ConversationId, userId, emoji);
            }
        }

        public async Task RemoveReactionAsync(Guid userId, Guid messageId, string emoji)
        {
            var reaction = await _dbContext.Reactions
                .FirstOrDefaultAsync(r => r.MessageId == messageId && r.UserId == userId && r.Emoji == emoji);

            if (reaction == null)
            {
                throw new KeyNotFoundException("Reaction not found.");
            }

            var message = await _dbContext.Messages.FindAsync(messageId);
            var conversationId = message?.ConversationId ?? Guid.Empty;

            _dbContext.Reactions.Remove(reaction);
            await _dbContext.SaveChangesAsync();

            if (conversationId != Guid.Empty)
            {
                // Broadcast reaction removed
                await _hubContext.Clients.Group($"conversation:{conversationId}")
                    .SendAsync("ReactionRemoved", messageId, conversationId, userId, emoji);

                // Also broadcast to each member's personal user group
                var rmMemberIds = await _dbContext.ConversationMembers
                    .Where(m => m.ConversationId == conversationId)
                    .Select(m => m.UserId)
                    .ToListAsync();
                foreach (var mid in rmMemberIds)
                {
                    await _hubContext.Clients.Group($"user:{mid}")
                        .SendAsync("ReactionRemoved", messageId, conversationId, userId, emoji);
                }
            }
        }

        public async Task MarkAsReadAsync(Guid userId, Guid messageId)
        {
            var message = await _dbContext.Messages.FindAsync(messageId);
            if (message == null)
            {
                throw new KeyNotFoundException("Message not found.");
            }

            if (!await IsConversationMemberAsync(message.ConversationId, userId))
            {
                throw new UnauthorizedAccessException("You are not a member of this conversation.");
            }

            var exists = await _dbContext.ReadReceipts
                .AnyAsync(r => r.MessageId == messageId && r.UserId == userId);

            if (!exists)
            {
                var receipt = new ReadReceipt
                {
                    MessageId = messageId,
                    UserId = userId,
                    ReadTime = DateTimeOffset.UtcNow
                };
                _dbContext.ReadReceipts.Add(receipt);

                // Update last read message ID in conversation member
                var member = await _dbContext.ConversationMembers
                    .FirstOrDefaultAsync(m => m.ConversationId == message.ConversationId && m.UserId == userId);
                if (member != null)
                {
                    member.LastReadMessageId = messageId;
                }

                await _dbContext.SaveChangesAsync();

                // Broadcast read receipt
                await _hubContext.Clients.Group($"conversation:{message.ConversationId}")
                    .SendAsync("MessageRead", messageId, message.ConversationId, userId);
            }
        }

        public async Task MarkAsDeliveredAsync(Guid userId, Guid messageId)
        {
            var message = await _dbContext.Messages.FindAsync(messageId);
            if (message == null)
            {
                throw new KeyNotFoundException("Message not found.");
            }

            if (!await IsConversationMemberAsync(message.ConversationId, userId))
            {
                throw new UnauthorizedAccessException("You are not a member of this conversation.");
            }

            var exists = await _dbContext.DeliveryReceipts
                .AnyAsync(r => r.MessageId == messageId && r.UserId == userId);

            if (!exists)
            {
                var receipt = new DeliveryReceipt
                {
                    MessageId = messageId,
                    UserId = userId,
                    DeliveryTime = DateTimeOffset.UtcNow
                };
                _dbContext.DeliveryReceipts.Add(receipt);
                await _dbContext.SaveChangesAsync();

                // Broadcast delivery receipt
                await _hubContext.Clients.Group($"conversation:{message.ConversationId}")
                    .SendAsync("MessageDelivered", messageId, message.ConversationId, userId);
            }
        }

        private async Task<bool> IsUserAdminAsync(Guid userId)
        {
            return await _dbContext.UserRoles
                .Include(ur => ur.Role)
                .AnyAsync(ur => ur.UserId == userId && (ur.Role.Name == "Administrator" || ur.Role.Name == "Super Administrator"));
        }

        private List<string> ParseMentions(string content)
        {
            var mentions = new List<string>();
            if (string.IsNullOrWhiteSpace(content))
            {
                return mentions;
            }

            var matches = Regex.Matches(content, @"@(\w+)");
            foreach (Match match in matches)
            {
                var username = match.Groups[1].Value;
                if (!mentions.Contains(username))
                {
                    mentions.Add(username);
                }
            }

            return mentions;
        }
    }
}
