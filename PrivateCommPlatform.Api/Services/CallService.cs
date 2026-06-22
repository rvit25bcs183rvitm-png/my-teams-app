using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PrivateCommPlatform.Api.Data;
using PrivateCommPlatform.Api.Hubs;
using PrivateCommPlatform.Api.Models.Entities;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Services
{
    public class CallService : ICallService
    {
        private readonly ApplicationDbContext _dbContext;
        private readonly IPresenceService _presenceService;
        private readonly IHubContext<CallHub> _hubContext;
        private readonly IServiceScopeFactory _scopeFactory;

        public CallService(
            ApplicationDbContext dbContext, 
            IPresenceService presenceService,
            IHubContext<CallHub> hubContext,
            IServiceScopeFactory scopeFactory)
        {
            _dbContext = dbContext;
            _presenceService = presenceService;
            _hubContext = hubContext;
            _scopeFactory = scopeFactory;
        }

        // Constructor overload for unit test compatibility
        public CallService(ApplicationDbContext dbContext, IPresenceService presenceService)
            : this(dbContext, presenceService, null!, null!)
        {
        }

        public async Task<CallingEligibilityResult> VerifyCallingEligibilityAsync(Guid callerId, Guid targetUserId)
        {
            // 1. Check Blocks
            var isBlocked = await _dbContext.UserBlocks
                .AnyAsync(b => (b.BlockerId == targetUserId && b.BlockedId == callerId) || 
                               (b.BlockerId == callerId && b.BlockedId == targetUserId));
            
            if (isBlocked)
            {
                return new CallingEligibilityResult { IsEligible = false, Reason = "Call blocked by user settings." };
            }

            // 2. Restricted Calling Rule (e.g. Role Check) & Billing Limit
            var caller = await _dbContext.Users.AsNoTracking().Include(u => u.UserRoles).ThenInclude(ur => ur.Role).FirstOrDefaultAsync(u => u.Id == callerId);

            var receiver = await _dbContext.Users.AsNoTracking().Include(u => u.UserRoles).ThenInclude(ur => ur.Role).FirstOrDefaultAsync(u => u.Id == targetUserId);

            if (caller == null || receiver == null)
            {
                return new CallingEligibilityResult { IsEligible = false, Reason = "User profile not found." };
            }

            // 3. Enforce Free Tier Call Limit
            if (caller.SubscriptionPlan == "Free")
            {
                // Reset MonthlyCallCount if it's a new billing cycle (simplified check)
                // Assuming cycle starts on 1st of month for simplicity or just check MonthlyCallCount
                if (caller.MonthlyCallCount >= 40)
                {
                    return new CallingEligibilityResult { IsEligible = false, Reason = "Monthly call limit reached for Free Tier. Please upgrade your plan." };
                }
            }

            // Example Rule: Employees cannot call Administrators unless they have an existing conversation membership.
            bool isCallerEmployee = caller.UserRoles.Any(ur => ur.Role.Name == "Employee");
            bool isReceiverAdmin = receiver.UserRoles.Any(ur => ur.Role.Name == "Administrator");

            if (isCallerEmployee && isReceiverAdmin)
            {
                var sharedRoomExists = await _dbContext.ConversationMembers
                    .Where(cm => cm.UserId == callerId)
                    .Select(cm => cm.ConversationId)
                    .AnyAsync(cId => _dbContext.ConversationMembers.Any(cm2 => cm2.ConversationId == cId && cm2.UserId == targetUserId));

                if (!sharedRoomExists)
                {
                    return new CallingEligibilityResult { IsEligible = false, Reason = "Restricted Calling: Employees cannot initiate direct voice calls with administrators without a shared chat room." };
                }
            }

            return new CallingEligibilityResult { IsEligible = true };
        }

        public async Task<Call> InitiateCallAsync(Guid callerId, Guid targetUserId, string type, string connectionId)
        {
            var call = new Call
            {
                CallerId = callerId,
                Status = "Ringing",
                Type = type,
                JoinCode = GenerateJoinCode()
            };
            _dbContext.Calls.Add(call);

            _dbContext.CallParticipants.Add(new CallParticipant
            {
                CallId = call.Id,
                UserId = callerId,
                Role = "Caller",
                Status = "Ringing"
            });

            _dbContext.CallParticipants.Add(new CallParticipant
            {
                CallId = call.Id,
                UserId = targetUserId,
                Role = "Receiver",
                Status = "Invited"
            });

            _dbContext.CallDevices.Add(new CallDevice
            {
                CallId = call.Id,
                UserId = callerId,
                ConnectionId = connectionId,
                DeviceName = "Web Client App",
                DeviceType = "WebClient",
                Status = "Connected"
            });

            _dbContext.CallEvents.Add(new CallEvent
            {
                CallId = call.Id,
                UserId = callerId,
                EventType = "CallStarted",
                Details = "Call request started."
            });

            _dbContext.CallAuditLogs.Add(new CallAuditLog
            {
                CallId = call.Id,
                ActorId = callerId,
                Action = "CallInitiated",
                IpAddress = "0.0.0.0",
                Details = $"Call setup initialized with user: {targetUserId}"
            });

            await _dbContext.SaveChangesAsync();

            // Only override the CALLER's presence immediately.
            // Do NOT set the receiver's presence until they explicitly accept the call.
            // Setting receiver to "Calling" before accept causes all future incoming calls
            // to be routed as CallWaiting instead of IncomingCall (stale presence bug).
            await _presenceService.SetPresenceOverrideAsync(callerId, "Calling");

            // Increment Monthly Call Count
            var caller = await _dbContext.Users.FindAsync(callerId);
            if (caller != null)
            {
                caller.MonthlyCallCount += 1;
                await _dbContext.SaveChangesAsync();

                // If Usage tier, report to Stripe API here (stubbed for now)
                if (caller.SubscriptionPlan == "Usage")
                {
                    // Metered billing logic
                    // Stripe.Billing.MeterEventService...
                }
            }

            // Start background timeout watchdog (30 seconds)
            StartCallTimeoutMonitor(call.Id);

            return call;
        }

        public async Task<Call> InitiateGroupCallAsync(Guid callerId, Guid conversationId, string connectionId)
        {
            var call = new Call
            {
                CallerId = callerId,
                ConversationId = conversationId,
                Status = "Ringing",
                Type = "Group",
                JoinCode = GenerateJoinCode()
            };
            _dbContext.Calls.Add(call);

            var members = await _dbContext.ConversationMembers
                .Where(cm => cm.ConversationId == conversationId)
                .Select(cm => cm.UserId)
                .ToListAsync();

            if (!members.Contains(callerId))
            {
                throw new UnauthorizedAccessException("You are not a member of this conversation.");
            }

            foreach (var memberId in members)
            {
                bool isCaller = memberId == callerId;
                _dbContext.CallParticipants.Add(new CallParticipant
                {
                    CallId = call.Id,
                    UserId = memberId,
                    Role = isCaller ? "Caller" : "Receiver",
                    Status = isCaller ? "Connected" : "Invited"
                });
            }

            _dbContext.CallDevices.Add(new CallDevice
            {
                CallId = call.Id,
                UserId = callerId,
                ConnectionId = connectionId,
                DeviceName = "Web Client App",
                DeviceType = "WebClient",
                Status = "Connected"
            });

            _dbContext.CallEvents.Add(new CallEvent
            {
                CallId = call.Id,
                UserId = callerId,
                EventType = "CallStarted",
                Details = $"Group call started in conversation {conversationId}."
            });

            _dbContext.CallAuditLogs.Add(new CallAuditLog
            {
                CallId = call.Id,
                ActorId = callerId,
                Action = "GroupCallInitiated",
                IpAddress = "0.0.0.0",
                Details = $"Group call setup initialized for conversation: {conversationId}"
            });

            await _dbContext.SaveChangesAsync();

            await _presenceService.SetPresenceOverrideAsync(callerId, "In Voice Call");
            foreach (var memberId in members.Where(id => id != callerId))
            {
                await _presenceService.SetPresenceOverrideAsync(memberId, "Calling");
            }

            // Increment Monthly Call Count
            var hostUser = await _dbContext.Users.FindAsync(callerId);
            if (hostUser != null)
            {
                hostUser.MonthlyCallCount += 1;
                await _dbContext.SaveChangesAsync();

                if (hostUser.SubscriptionPlan == "Usage")
                {
                    // Metered billing logic
                }
            }

            // Start background timeout watchdog (30 seconds)
            StartCallTimeoutMonitor(call.Id);

            return call;
        }

        public async Task<Call> AcceptCallAsync(Guid callId, Guid userId, string connectionId)
        {
            var call = await _dbContext.Calls
                .Include(c => c.Participants)
                .FirstOrDefaultAsync(c => c.Id == callId);

            if (call == null) throw new ArgumentException("Call session not found.");

            call.Status = "Connected";
            
            var participant = call.Participants.FirstOrDefault(p => p.UserId == userId);
            if (participant != null)
            {
                participant.Status = "Connected";
                participant.JoinedTime = DateTimeOffset.UtcNow;
            }

            var callerParticipant = call.Participants.FirstOrDefault(p => p.UserId == call.CallerId);
            if (callerParticipant != null)
            {
                callerParticipant.Status = "Connected";
                callerParticipant.JoinedTime = DateTimeOffset.UtcNow;
            }

            _dbContext.CallDevices.Add(new CallDevice
            {
                CallId = call.Id,
                UserId = userId,
                ConnectionId = connectionId,
                DeviceName = "Web Client App",
                DeviceType = "WebClient",
                Status = "Connected"
            });

            _dbContext.CallEvents.Add(new CallEvent
            {
                CallId = callId,
                UserId = userId,
                EventType = "CallAccepted",
                Details = "Call accepted."
            });

            _dbContext.CallEvents.Add(new CallEvent
            {
                CallId = callId,
                UserId = userId,
                EventType = "ParticipantJoined",
                Details = "Receiver joined the call."
            });

            _dbContext.CallEvents.Add(new CallEvent
            {
                CallId = callId,
                UserId = call.CallerId,
                EventType = "ParticipantJoined",
                Details = "Caller joined the call."
            });

            await _dbContext.SaveChangesAsync();

            await _presenceService.SetPresenceOverrideAsync(call.CallerId, "In Voice Call");
            await _presenceService.SetPresenceOverrideAsync(userId, "In Voice Call");

            return call;
        }

        public async Task<Call> RejectCallAsync(Guid callId, Guid userId, string reason)
        {
            var call = await _dbContext.Calls
                .Include(c => c.Participants)
                .FirstOrDefaultAsync(c => c.Id == callId);

            if (call == null) throw new ArgumentException("Call session not found.");

            call.Status = reason == "Busy" ? "Busy" : "Rejected";
            call.EndTime = DateTimeOffset.UtcNow;

            var participant = call.Participants.FirstOrDefault(p => p.UserId == userId);
            if (participant != null)
            {
                participant.Status = reason == "Busy" ? "Busy" : "Rejected";
                participant.LeftTime = DateTimeOffset.UtcNow;
            }

            _dbContext.CallEvents.Add(new CallEvent
            {
                CallId = callId,
                UserId = userId,
                EventType = "CallRejected",
                Details = $"Call rejected. Reason: {reason}"
            });

            await _dbContext.SaveChangesAsync();

            await _presenceService.SetPresenceOverrideAsync(call.CallerId, null);
            await _presenceService.SetPresenceOverrideAsync(userId, null);

            return call;
        }

        public async Task<Call> EndCallAsync(Guid callId, Guid userId)
        {
            var call = await _dbContext.Calls
                .Include(c => c.Participants)
                .FirstOrDefaultAsync(c => c.Id == callId);

            if (call == null) throw new ArgumentException("Call session not found.");

            if (call.Status == "Completed") return call;

            call.Status = "Completed";
            call.EndTime = DateTimeOffset.UtcNow;
            call.Duration = (int)(call.EndTime.Value - call.StartTime).TotalSeconds;

            foreach (var participant in call.Participants)
            {
                if (participant.LeftTime == null)
                {
                    participant.LeftTime = DateTimeOffset.UtcNow;
                }
                participant.Status = "Disconnected";
            }

            _dbContext.CallEvents.Add(new CallEvent
            {
                CallId = callId,
                UserId = userId,
                EventType = "CallEnded",
                Details = "Call session completed."
            });

            foreach (var participant in call.Participants)
            {
                _dbContext.CallEvents.Add(new CallEvent
                {
                    CallId = callId,
                    UserId = participant.UserId,
                    EventType = "ParticipantLeft",
                    Details = "Participant left/disconnected from call."
                });
            }

            await _dbContext.SaveChangesAsync();

            await _presenceService.SetPresenceOverrideAsync(call.CallerId, null);
            foreach (var participant in call.Participants)
            {
                await _presenceService.SetPresenceOverrideAsync(participant.UserId, null);
            }

            return call;
        }

        public async Task LogCallEventAsync(Guid callId, Guid? userId, string eventType, string details)
        {
            _dbContext.CallEvents.Add(new CallEvent
            {
                CallId = callId,
                UserId = userId,
                EventType = eventType,
                Details = details
            });
            await _dbContext.SaveChangesAsync();
        }

        public async Task HandleDeviceDisconnectAsync(Guid userId, string connectionId)
        {
            var devices = await _dbContext.CallDevices
                .Where(d => d.UserId == userId && d.ConnectionId == connectionId && d.Status == "Connected")
                .ToListAsync();

            foreach (var device in devices)
            {
                device.Status = "Disconnected";
                _dbContext.CallEvents.Add(new CallEvent
                {
                    CallId = device.CallId,
                    UserId = userId,
                    EventType = "ConnectionLost",
                    Details = $"Device disconnected: {connectionId}"
                });

                // Fetch call and check if it's active
                var call = await _dbContext.Calls
                    .Include(c => c.Participants)
                    .FirstOrDefaultAsync(c => c.Id == device.CallId && c.Status != "Completed" && c.Status != "Rejected" && c.Status != "Busy" && c.Status != "Cancelled" && c.Status != "Failed" && c.Status != "Missed");

                if (call != null)
                {
                    // If Caller disconnected, or if it is OneToOne and any participant disconnected, complete the call
                    // FIX: DO NOT automatically complete the call on SignalR disconnect. 
                    // SignalR reconnects frequently, and the WebRTC P2P connection stays alive even if SignalR drops.
                    // Dropping the call here causes random disconnects after a few seconds or on minor network blips.
                    /*
                    if (call.CallerId == userId || call.Type == "OneToOne")
                    {
                        call.Status = "Completed";
                        call.EndTime = DateTimeOffset.UtcNow;
                        call.Duration = (int)(call.EndTime.Value - call.StartTime).TotalSeconds;

                        foreach (var participant in call.Participants)
                        {
                            if (participant.LeftTime == null)
                            {
                                participant.LeftTime = DateTimeOffset.UtcNow;
                            }
                            participant.Status = "Disconnected";
                            await _presenceService.SetPresenceOverrideAsync(participant.UserId, null);
                        }
                        await _presenceService.SetPresenceOverrideAsync(call.CallerId, null);

                        _dbContext.CallEvents.Add(new CallEvent
                        {
                            CallId = call.Id,
                            UserId = userId,
                            EventType = "CallEnded",
                            Details = "Call automatically cleaned up due to device disconnection."
                        });

                        // Broadcast CallEnded event via SignalR
                        if (_hubContext != null)
                        {
                            await _hubContext.Clients.Group($"call_user:{call.CallerId}").SendAsync("CallEnded", new { callId = call.Id, reason = "Disconnection" });
                            foreach (var participant in call.Participants)
                            {
                                await _hubContext.Clients.Group($"call_user:{participant.UserId}").SendAsync("CallEnded", new { callId = call.Id, reason = "Disconnection" });
                            }
                        }
                    }
                    */
                }
            }
            await _dbContext.SaveChangesAsync();
        }

        public async Task SubmitCallStatisticsAsync(Guid callId, Guid userId, CallStatistic stats)
        {
            stats.CallId = callId;
            stats.UserId = userId;
            _dbContext.CallStatistics.Add(stats);
            await _dbContext.SaveChangesAsync();
        }

        public async Task SaveCallRatingAsync(Guid callId, Guid userId, int rating, string? feedback)
        {
            var call = await _dbContext.Calls.FindAsync(callId);
            if (call != null)
            {
                call.UserRating = rating;
                call.UserFeedback = feedback;
                await _dbContext.SaveChangesAsync();
            }
        }

        public async Task<Call?> GetCallDetailsAsync(Guid callId)
        {
            return await _dbContext.Calls
                .AsNoTracking()
                .Include(c => c.Participants)
                .Include(c => c.Events)
                .FirstOrDefaultAsync(c => c.Id == callId);
        }

        public async Task RemoveParticipantAsync(Guid callId, Guid userId)
        {
            var participant = await _dbContext.CallParticipants
                .FirstOrDefaultAsync(p => p.CallId == callId && p.UserId == userId);
            if (participant != null)
            {
                participant.Status = "Disconnected";
                participant.LeftTime = DateTimeOffset.UtcNow;
                
                _dbContext.CallEvents.Add(new CallEvent
                {
                    CallId = callId,
                    UserId = userId,
                    EventType = "ParticipantRemoved",
                    Details = $"Participant removed from call."
                });

                await _dbContext.SaveChangesAsync();
            }
        }

        public async Task LockCallSessionAsync(Guid callId, bool isLocked)
        {
            var call = await _dbContext.Calls.FindAsync(callId);
            if (call != null)
            {
                call.IsLocked = isLocked;
                
                _dbContext.CallEvents.Add(new CallEvent
                {
                    CallId = callId,
                    EventType = isLocked ? "CallLocked" : "CallUnlocked",
                    Details = isLocked ? "Call was locked by host." : "Call was unlocked by host."
                });

                await _dbContext.SaveChangesAsync();
            }
        }

        public async Task TransferCallHostAsync(Guid callId, Guid currentHostId, Guid newHostId)
        {
            var call = await _dbContext.Calls
                .Include(c => c.Participants)
                .FirstOrDefaultAsync(c => c.Id == callId);

            if (call == null) throw new ArgumentException("Call session not found.");
            if (call.CallerId != currentHostId) throw new UnauthorizedAccessException("Only the current host can transfer host privileges.");

            var newHost = call.Participants.FirstOrDefault(p => p.UserId == newHostId);
            if (newHost == null) throw new ArgumentException("The new host is not an active participant in this call.");

            call.CallerId = newHostId;
            newHost.Role = "Caller"; // Inherits host role

            var oldHost = call.Participants.FirstOrDefault(p => p.UserId == currentHostId);
            if (oldHost != null)
            {
                oldHost.Role = "Receiver"; // Downgraded
            }

            _dbContext.CallEvents.Add(new CallEvent
            {
                CallId = call.Id,
                UserId = currentHostId,
                EventType = "HostTransferred",
                Details = $"Host privileges transferred to user {newHostId}."
            });

            await _dbContext.SaveChangesAsync();
        }

        public async Task<Call> AddParticipantAsync(Guid callId, Guid targetUserId)
        {
            var call = await _dbContext.Calls
                .Include(c => c.Participants)
                .FirstOrDefaultAsync(c => c.Id == callId);

            if (call == null || call.Status == "Completed") throw new ArgumentException("Active call session not found.");
            
            // Check if already in call
            if (call.Participants.Any(p => p.UserId == targetUserId)) return call;

            call.Type = "Group";

            _dbContext.CallParticipants.Add(new CallParticipant
            {
                CallId = call.Id,
                UserId = targetUserId,
                Role = "Receiver",
                Status = "Invited"
            });

            _dbContext.CallEvents.Add(new CallEvent
            {
                CallId = call.Id,
                UserId = targetUserId,
                EventType = "ParticipantAdded",
                Details = $"User {targetUserId} was added to the active call."
            });

            await _dbContext.SaveChangesAsync();

            return call;
        }

        public async Task<Call> JoinCallByCodeAsync(string joinCode, Guid userId, string connectionId)
        {
            var cleanInput = joinCode.Replace(" ", "").Replace("-", "");
            var call = await _dbContext.Calls
                .Include(c => c.Participants)
                .FirstOrDefaultAsync(c => c.JoinCode != null && c.JoinCode.Replace(" ", "") == cleanInput && c.Status == "Connected");

            if (call == null) throw new ArgumentException("Invalid Join Code or the meeting has ended.");
            if (call.IsLocked) throw new UnauthorizedAccessException("This meeting is locked by the host.");

            call.Type = "Group";

            if (!call.Participants.Any(p => p.UserId == userId))
            {
                _dbContext.CallParticipants.Add(new CallParticipant
                {
                    CallId = call.Id,
                    UserId = userId,
                    Role = "Receiver",
                    Status = "Connected",
                    JoinedTime = DateTimeOffset.UtcNow
                });
            }
            else
            {
                var participant = call.Participants.First(p => p.UserId == userId);
                participant.Status = "Connected";
                participant.JoinedTime = DateTimeOffset.UtcNow;
            }

            _dbContext.CallDevices.Add(new CallDevice
            {
                CallId = call.Id,
                UserId = userId,
                ConnectionId = connectionId,
                DeviceName = "Web Client App",
                DeviceType = "WebClient",
                Status = "Connected"
            });

            _dbContext.CallEvents.Add(new CallEvent
            {
                CallId = call.Id,
                UserId = userId,
                EventType = "UserJoinedByCode",
                Details = $"User joined meeting via Join Code."
            });

            await _dbContext.SaveChangesAsync();

            return call;
        }

        public async Task<Call> InitiateInstantMeetingAsync(Guid hostId, string connectionId)
        {
            var call = new Call
            {
                CallerId = hostId,
                Status = "Connected",
                Type = "Group",
                JoinCode = GenerateJoinCode()
            };
            _dbContext.Calls.Add(call);

            _dbContext.CallParticipants.Add(new CallParticipant
            {
                CallId = call.Id,
                UserId = hostId,
                Role = "Host",
                Status = "Connected",
                JoinedTime = DateTimeOffset.UtcNow
            });

            _dbContext.CallDevices.Add(new CallDevice
            {
                CallId = call.Id,
                UserId = hostId,
                ConnectionId = connectionId,
                DeviceName = "Web Client App",
                DeviceType = "WebClient",
                Status = "Connected"
            });

            _dbContext.CallEvents.Add(new CallEvent
            {
                CallId = call.Id,
                UserId = hostId,
                EventType = "InstantMeetingStarted",
                Details = "Instant meeting started by host."
            });

            _dbContext.CallAuditLogs.Add(new CallAuditLog
            {
                CallId = call.Id,
                ActorId = hostId,
                Action = "InstantMeetingInitiated",
                IpAddress = "0.0.0.0",
                Details = $"Instant meeting session initialized."
            });

            await _dbContext.SaveChangesAsync();

            await _presenceService.SetPresenceOverrideAsync(hostId, "In Voice Call");

            return call;
        }

        private string GenerateJoinCode()
        {
            var random = new Random();
            return $"{random.Next(100, 999)} {random.Next(100, 999)} {random.Next(100, 999)}";
        }

        public async Task<Call?> GetActiveCallForUserAsync(Guid userId)
        {
            return await _dbContext.Calls
                .AsNoTracking()
                .Include(c => c.Participants)
                .Where(c => c.Status != "Completed" && c.Status != "Rejected" && c.Status != "Busy" && c.Status != "Cancelled" && c.Status != "Failed" && c.Status != "Missed")
                .FirstOrDefaultAsync(c => c.CallerId == userId || c.Participants.Any(p => p.UserId == userId));
        }

        public async Task HandleCallTimeoutAsync(Guid callId)
        {
            var call = await _dbContext.Calls
                .Include(c => c.Participants)
                .FirstOrDefaultAsync(c => c.Id == callId);

            if (call != null && (call.Status == "Initiated" || call.Status == "Ringing"))
            {
                call.Status = "Missed";
                call.EndTime = DateTimeOffset.UtcNow;

                foreach (var participant in call.Participants)
                {
                    if (participant.Status == "Invited" || participant.Status == "Ringing")
                    {
                        participant.Status = "Missed";
                    }
                    participant.LeftTime = DateTimeOffset.UtcNow;
                    await _presenceService.SetPresenceOverrideAsync(participant.UserId, null);
                }
                await _presenceService.SetPresenceOverrideAsync(call.CallerId, null);

                _dbContext.CallEvents.Add(new CallEvent
                {
                    CallId = callId,
                    EventType = "CallMissed",
                    Details = "Call timed out after 30 seconds."
                });

                await _dbContext.SaveChangesAsync();

                // Notify caller and receiver to stop ringing
                if (_hubContext != null)
                {
                    await _hubContext.Clients.Group($"call_user:{call.CallerId}").SendAsync("CallEnded", new { callId = callId, reason = "Timeout" });
                    foreach (var participant in call.Participants)
                    {
                        await _hubContext.Clients.Group($"call_user:{participant.UserId}").SendAsync("CallEnded", new { callId = callId, reason = "Timeout" });
                    }
                }
            }
        }

        private void StartCallTimeoutMonitor(Guid callId)
        {
            if (_scopeFactory == null) return;

            _ = Task.Run(async () =>
            {
                await Task.Delay(30000); // 30 seconds timeout
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var callService = scope.ServiceProvider.GetRequiredService<ICallService>();
                    await callService.HandleCallTimeoutAsync(callId);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[Call Timeout Monitor Error]: {ex.Message}");
                }
            });
        }
    }
}

