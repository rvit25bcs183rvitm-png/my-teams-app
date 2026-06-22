using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PrivateCommPlatform.Api.Data;
using PrivateCommPlatform.Api.Hubs;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Services
{
    public class PresenceService : IPresenceService
    {
        private class UserPresenceState
        {
            public string? ManualOverride { get; set; }
            public HashSet<string> ConnectionIds { get; } = new HashSet<string>();
        }

        private readonly ConcurrentDictionary<Guid, UserPresenceState> _presenceCache = new();
        private readonly IHubContext<ChatHub> _hubContext;
        private readonly IServiceScopeFactory _scopeFactory;

        public PresenceService(IHubContext<ChatHub> hubContext, IServiceScopeFactory scopeFactory)
        {
            _hubContext = hubContext;
            _scopeFactory = scopeFactory;
        }

        public async Task RegisterConnectionAsync(Guid userId, string connectionId)
        {
            var state = _presenceCache.GetOrAdd(userId, _ => new UserPresenceState());
            string oldStatus;
            string newStatus;

            lock (state)
            {
                oldStatus = GetStatusFromState(state);
                state.ConnectionIds.Add(connectionId);
                newStatus = GetStatusFromState(state);
            }

            if (oldStatus != newStatus)
            {
                await UpdateDatabaseUserActivityAsync(userId);
                await BroadcastPresenceStatusAsync(userId, newStatus);
            }
        }

        public async Task DeregisterConnectionAsync(Guid userId, string connectionId)
        {
            if (!_presenceCache.TryGetValue(userId, out var state))
            {
                return;
            }

            string oldStatus;
            string newStatus;
            bool shouldScheduleDelay = false;

            lock (state)
            {
                oldStatus = GetStatusFromState(state);
                state.ConnectionIds.Remove(connectionId);
                newStatus = GetStatusFromState(state);

                if (state.ConnectionIds.Count == 0)
                {
                    shouldScheduleDelay = true;
                }
            }

            if (oldStatus != newStatus && !shouldScheduleDelay)
            {
                await BroadcastPresenceStatusAsync(userId, newStatus);
            }

            if (shouldScheduleDelay)
            {
                // Run delayed offline check in background thread
                _ = Task.Run(async () =>
                {
                    await Task.Delay(30000);
                    await EvaluateOfflineTransitionAsync(userId);
                });
            }
        }

        public async Task SetPresenceOverrideAsync(Guid userId, string? status)
        {
            var state = _presenceCache.GetOrAdd(userId, _ => new UserPresenceState());
            string oldStatus;
            string newStatus;

            lock (state)
            {
                oldStatus = GetStatusFromState(state);
                state.ManualOverride = status;
                newStatus = GetStatusFromState(state);
            }

            if (oldStatus != newStatus)
            {
                await UpdateDatabaseUserActivityAsync(userId);
                await BroadcastPresenceStatusAsync(userId, newStatus);
            }
        }

        public Task<string> GetPresenceAsync(Guid userId)
        {
            if (_presenceCache.TryGetValue(userId, out var state))
            {
                lock (state)
                {
                    return Task.FromResult(GetStatusFromState(state));
                }
            }
            return Task.FromResult("Offline");
        }

        public Task<Dictionary<Guid, string>> GetAllPresenceAsync()
        {
            var result = new Dictionary<Guid, string>();
            foreach (var kvp in _presenceCache)
            {
                lock (kvp.Value)
                {
                    result[kvp.Key] = GetStatusFromState(kvp.Value);
                }
            }
            return Task.FromResult(result);
        }

        private string GetStatusFromState(UserPresenceState state)
        {
            if (state.ConnectionIds.Count == 0)
            {
                if (state.ManualOverride == "Calling" || state.ManualOverride == "In Voice Call")
                {
                    state.ManualOverride = null;
                }
                return "Offline";
            }
            if (state.ManualOverride != null)
            {
                return state.ManualOverride;
            }
            return "Online";
        }

        private async Task EvaluateOfflineTransitionAsync(Guid userId)
        {
            if (!_presenceCache.TryGetValue(userId, out var state))
            {
                return;
            }

            string newStatus;
            lock (state)
            {
                if (state.ConnectionIds.Count > 0)
                {
                    // User reconnected before 30 seconds elapsed
                    return;
                }
                newStatus = GetStatusFromState(state);
            }

            // Broadcast the offline change
            await BroadcastPresenceStatusAsync(userId, newStatus);
        }

        private async Task BroadcastPresenceStatusAsync(Guid userId, string status)
        {
            var sharedUserIds = await GetSharedUserIdsAsync(userId);
            foreach (var sharedId in sharedUserIds)
            {
                await _hubContext.Clients.Group($"user:{sharedId}")
                    .SendAsync("UserPresenceChanged", userId, status);
            }
        }

        private async Task<List<Guid>> GetSharedUserIdsAsync(Guid userId)
        {
            using var scope = _scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            return await dbContext.ConversationMembers
                .Where(m => dbContext.ConversationMembers
                    .Where(x => x.UserId == userId)
                    .Select(x => x.ConversationId)
                    .Contains(m.ConversationId) && m.UserId != userId)
                .Select(m => m.UserId)
                .Distinct()
                .ToListAsync();
        }

        private async Task UpdateDatabaseUserActivityAsync(Guid userId)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var user = await dbContext.Users.FindAsync(userId);
                if (user != null)
                {
                    user.LastActivityDate = DateTimeOffset.UtcNow;
                    await dbContext.SaveChangesAsync();
                }
            }
            catch
            {
                // Suppress DB update errors in background threads to avoid crashing SignalR hub
            }
        }
    }
}
