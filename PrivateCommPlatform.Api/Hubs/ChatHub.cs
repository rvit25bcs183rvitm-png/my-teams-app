using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using PrivateCommPlatform.Api.Data;
using PrivateCommPlatform.Api.Services;
using System;
using System.Security.Claims;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Hubs
{
    [Authorize]
    public class ChatHub : Hub
    {
        private readonly ApplicationDbContext _dbContext;
        private readonly IPresenceService _presenceService;

        public ChatHub(ApplicationDbContext dbContext, IPresenceService presenceService)
        {
            _dbContext = dbContext;
            _presenceService = presenceService;
        }

        public override async Task OnConnectedAsync()
        {
            var userId = GetUserId();
            if (userId != Guid.Empty)
            {
                // Join user's personal group
                await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{userId}");

                // Register connection in presence service (this handles status update & broadcast)
                await _presenceService.RegisterConnectionAsync(userId, Context.ConnectionId);
            }

            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var userId = GetUserId();
            if (userId != Guid.Empty)
            {
                // Leave user's personal group
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"user:{userId}");

                // Deregister connection in presence service (triggers 30s offline delay)
                await _presenceService.DeregisterConnectionAsync(userId, Context.ConnectionId);
            }

            await base.OnDisconnectedAsync(exception);
        }

        public async Task JoinConversation(string conversationIdStr)
        {
            if (!Guid.TryParse(conversationIdStr, out Guid conversationId))
            {
                throw new HubException("Invalid conversation ID format.");
            }

            var userId = GetUserId();
            if (userId == Guid.Empty)
            {
                throw new HubException("Unauthorized.");
            }

            // Verify membership
            var isMember = await _dbContext.ConversationMembers
                .AnyAsync(m => m.ConversationId == conversationId && m.UserId == userId);

            if (!isMember)
            {
                throw new HubException("Forbidden: You are not a member of this conversation.");
            }

            await Groups.AddToGroupAsync(Context.ConnectionId, $"conversation:{conversationId}");
        }

        public async Task LeaveConversation(string conversationIdStr)
        {
            if (!Guid.TryParse(conversationIdStr, out Guid conversationId))
            {
                throw new HubException("Invalid conversation ID format.");
            }

            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"conversation:{conversationId}");
        }

        public async Task SendTypingState(string conversationIdStr, bool isTyping)
        {
            if (!Guid.TryParse(conversationIdStr, out Guid conversationId))
            {
                throw new HubException("Invalid conversation ID format.");
            }

            var userId = GetUserId();
            if (userId == Guid.Empty)
            {
                throw new HubException("Unauthorized.");
            }

            // Verify membership
            var isMember = await _dbContext.ConversationMembers
                .AnyAsync(m => m.ConversationId == conversationId && m.UserId == userId);

            if (!isMember)
            {
                throw new HubException("Forbidden.");
            }

            // Broadcast typing state to other members in the conversation
            await Clients.OthersInGroup($"conversation:{conversationId}")
                .SendAsync("UserTyping", userId, conversationId, isTyping);
        }

        private Guid GetUserId()
        {
            var userIdClaim = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return Guid.TryParse(userIdClaim, out Guid id) ? id : Guid.Empty;
        }
    }
}
