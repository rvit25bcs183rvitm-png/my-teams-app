using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using PrivateCommPlatform.Api.Services;
using System;
using System.Security.Claims;
using System.Threading.Tasks;
using System.Linq;
using Microsoft.EntityFrameworkCore;

namespace PrivateCommPlatform.Api.Hubs
{
    [Authorize]
    public class CallHub : Hub
    {
        private readonly ICallService _callService;
        private readonly IPresenceService _presenceService;
        private readonly PrivateCommPlatform.Api.Data.ApplicationDbContext _dbContext;

        public CallHub(ICallService callService, IPresenceService presenceService, PrivateCommPlatform.Api.Data.ApplicationDbContext dbContext)
        {
            _callService = callService;
            _presenceService = presenceService;
            _dbContext = dbContext;
        }

        public override async Task OnConnectedAsync()
        {
            var userId = GetUserId();
            if (userId != Guid.Empty)
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, $"call_user:{userId}");
            }
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var userId = GetUserId();
            if (userId != Guid.Empty)
            {
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"call_user:{userId}");
                await _callService.HandleDeviceDisconnectAsync(userId, Context.ConnectionId);
            }
            await base.OnDisconnectedAsync(exception);
        }

        public async Task StartCall(Guid targetUserId, string type)
        {
            var callerId = GetUserId();
            if (callerId == Guid.Empty || callerId == targetUserId)
            {
                throw new HubException("Invalid calling action.");
            }

            // Perform Call Blocking & Restricted Calling checks prior to initiation
            var canCall = await _callService.VerifyCallingEligibilityAsync(callerId, targetUserId);
            if (!canCall.IsEligible)
            {
                throw new HubException(canCall.Reason);
            }

            // Check if receiver is currently in a call to trigger Call Waiting
            var targetPresence = await _presenceService.GetPresenceAsync(targetUserId);
            bool isWaiting = (targetPresence == "Calling" || targetPresence == "In Voice Call");

            var call = await _callService.InitiateCallAsync(callerId, targetUserId, type, Context.ConnectionId);

            if (isWaiting)
            {
                // Trigger call waiting on receiver's devices
                await Clients.Group($"call_user:{targetUserId}").SendAsync("CallWaiting", new {
                    callId = call.Id,
                    callerId = callerId,
                    callerUsername = Context.User?.Identity?.Name
                });
            }
            else
            {
                // Normal incoming call ring
                await Clients.Group($"call_user:{targetUserId}").SendAsync("IncomingCall", new {
                    callId = call.Id,
                    callerId = callerId,
                    callerUsername = Context.User?.Identity?.Name,
                    type = type
                });
            }

            await Clients.Group($"call_user:{callerId}").SendAsync("OutgoingCallStarted", new {
                callId = call.Id,
                targetUserId = targetUserId,
                isWaiting = isWaiting
            });
        }

        public async Task StartGroupCall(Guid conversationId)
        {
            var callerId = GetUserId();
            if (callerId == Guid.Empty)
            {
                throw new HubException("Invalid calling action.");
            }

            var call = await _callService.InitiateGroupCallAsync(callerId, conversationId, Context.ConnectionId);

            var memberIds = call.Participants
                .Where(p => p.UserId != callerId)
                .Select(p => p.UserId)
                .ToList();

            foreach (var memberId in memberIds)
            {
                await Clients.Group($"call_user:{memberId}").SendAsync("IncomingGroupCall", new {
                    callId = call.Id,
                    conversationId = conversationId,
                    callerId = callerId,
                    callerUsername = Context.User?.Identity?.Name
                });
            }

            await Clients.Group($"call_user:{callerId}").SendAsync("OutgoingGroupCallStarted", new {
                callId = call.Id,
                conversationId = conversationId
            });
        }

        public async Task AcceptCall(Guid callId)
        {
            var userId = GetUserId();
            var call = await _callService.AcceptCallAsync(callId, userId, Context.ConnectionId);

            await Clients.Group($"call_user:{call.CallerId}").SendAsync("CallAccepted", new {
                callId = callId,
                accepterId = userId
            });

            // Notify other connected participants in a group call that someone joined
            var otherConnectedParticipants = call.Participants
                .Where(p => p.UserId != userId && p.UserId != call.CallerId && p.Status == "Connected")
                .ToList();

            foreach (var participant in otherConnectedParticipants)
            {
                await Clients.Group($"call_user:{participant.UserId}").SendAsync("UserJoinedCall", new {
                    callId = callId,
                    userId = userId
                });
            }

            await Clients.Group($"call_user:{userId}").SendAsync("StopRinging", new {
                callId = callId,
                answeredByDevice = Context.ConnectionId
            });
        }

        public async Task RejectCall(Guid callId, string reason)
        {
            var userId = GetUserId();
            if (userId == Guid.Empty) return;

            if (callId == Guid.Empty)
            {
                var activeCall = await _callService.GetActiveCallForUserAsync(userId);
                if (activeCall != null)
                {
                    callId = activeCall.Id;
                }
            }

            if (callId != Guid.Empty)
            {
                var call = await _callService.RejectCallAsync(callId, userId, reason);

                await Clients.Group($"call_user:{call.CallerId}").SendAsync("CallRejected", new {
                    callId = callId,
                    rejecterId = userId,
                    reason = reason
                });

                await Clients.Group($"call_user:{userId}").SendAsync("StopRinging", new {
                    callId = callId,
                    answeredByDevice = Context.ConnectionId
                });
            }
        }

        public async Task UpgradeToGroupCall(Guid callId, List<string> userIds)
        {
            // Stub to prevent frontend crash when clicking Add Member
            await Task.CompletedTask;
        }

        public async Task AddParticipantToGroupCall(Guid callId, string userId)
        {
            // Stub to prevent frontend crash when clicking Add Member
            await Task.CompletedTask;
        }

        public async Task SendSignalingMessage(Guid targetUserId, string messageType, string payload)
        {
            var senderId = GetUserId();
            
            // Validate that sender and target are in the same active call to prevent signaling spoofing
            var areInSameCall = await _dbContext.Calls
                .AsNoTracking()
                .AnyAsync(c => 
                    (c.Status != "Completed" && c.Status != "Rejected" && c.Status != "Busy" && c.Status != "Cancelled" && c.Status != "Failed" && c.Status != "Missed")
                    && c.Participants.Any(p => p.UserId == senderId)
                    && c.Participants.Any(p => p.UserId == targetUserId));

            if (!areInSameCall)
            {
                throw new HubException("Forbidden: Not in an active call with this user.");
            }

            await Clients.Group($"call_user:{targetUserId}").SendAsync("ReceiveSignaling", new {
                senderId = senderId,
                messageType = messageType,
                payload = payload
            });
        }

        public async Task InitiateDeviceTransfer(Guid callId, string targetConnectionId)
        {
            var userId = GetUserId();
            // Request active call to transfer to the invoking connection
            await _callService.LogCallEventAsync(callId, userId, "DeviceTransfer", $"Device transfer initiated to connection: {targetConnectionId}");
            
            // Send signal to old devices to release WebRTC stream and transfer coordinates
            await Clients.Group($"call_user:{userId}").SendAsync("ExecuteDeviceTransfer", new {
                callId = callId,
                newConnectionId = targetConnectionId
            });
        }

        public async Task EndCall(Guid callId)
        {
            var userId = GetUserId();
            if (userId == Guid.Empty) return;

            if (callId == Guid.Empty)
            {
                var activeCall = await _callService.GetActiveCallForUserAsync(userId);
                if (activeCall != null)
                {
                    callId = activeCall.Id;
                }
            }

            if (callId != Guid.Empty)
            {
                var call = await _callService.EndCallAsync(callId, userId);

                await Clients.Group($"call_user:{call.CallerId}").SendAsync("CallEnded", new { callId = callId });
                foreach (var participant in call.Participants)
                {
                    await Clients.Group($"call_user:{participant.UserId}").SendAsync("CallEnded", new { callId = callId });
                }
            }
        }

        public async Task MuteAllParticipants(Guid callId)
        {
            var userId = GetUserId();
            var call = await _callService.GetCallDetailsAsync(callId);
            if (call == null) return;

            var callerParticipant = call.Participants.FirstOrDefault(p => p.UserId == userId);
            if (callerParticipant == null || (callerParticipant.Role != "Host" && callerParticipant.Role != "Caller" && call.CallerId != userId))
            {
                throw new HubException("Only the Call Host can mute all participants.");
            }

            foreach (var participant in call.Participants.Where(p => p.UserId != userId && p.Status == "Connected"))
            {
                await Clients.Group($"call_user:{participant.UserId}").SendAsync("MuteMicrophone", new { callId = callId });
            }
        }

        public async Task RemoveFromCall(Guid callId, Guid targetUserId)
        {
            var userId = GetUserId();
            var call = await _callService.GetCallDetailsAsync(callId);
            if (call == null) return;

            var callerParticipant = call.Participants.FirstOrDefault(p => p.UserId == userId);
            if (callerParticipant == null || (callerParticipant.Role != "Host" && callerParticipant.Role != "Caller" && call.CallerId != userId))
            {
                throw new HubException("Only the Call Host can remove participants.");
            }

            await _callService.RemoveParticipantAsync(callId, targetUserId);

            // Force disconnect the target user's devices
            await Clients.Group($"call_user:{targetUserId}").SendAsync("ForceDisconnectCall", new { callId = callId });

            // Notify all other connected participants
            foreach (var participant in call.Participants.Where(p => p.Status == "Connected"))
            {
                await Clients.Group($"call_user:{participant.UserId}").SendAsync("ParticipantRemoved", new { callId = callId, userId = targetUserId });
            }
        }

        public async Task LockCallSession(Guid callId, bool isLocked)
        {
            var userId = GetUserId();
            var call = await _callService.GetCallDetailsAsync(callId);
            if (call == null) return;

            var callerParticipant = call.Participants.FirstOrDefault(p => p.UserId == userId);
            if (callerParticipant == null || (callerParticipant.Role != "Host" && callerParticipant.Role != "Caller" && call.CallerId != userId))
            {
                throw new HubException("Only the Call Host can lock the call session.");
            }

            await _callService.LockCallSessionAsync(callId, isLocked);

            // Notify all connected participants
            foreach (var participant in call.Participants.Where(p => p.Status == "Connected"))
            {
                await Clients.Group($"call_user:{participant.UserId}").SendAsync("CallLockStatusChanged", new { callId = callId, isLocked = isLocked });
            }
        }

        public async Task TransferCallHost(Guid callId, Guid newHostUserId)
        {
            var userId = GetUserId();
            var call = await _callService.GetCallDetailsAsync(callId);
            if (call == null) return;

            var callerParticipant = call.Participants.FirstOrDefault(p => p.UserId == userId);
            if (callerParticipant == null || (callerParticipant.Role != "Host" && callerParticipant.Role != "Caller" && call.CallerId != userId))
            {
                throw new HubException("Only the Call Host can transfer the host role.");
            }

            await _callService.TransferCallHostAsync(callId, userId, newHostUserId);

            // Notify all connected participants
            foreach (var participant in call.Participants.Where(p => p.Status == "Connected"))
            {
                await Clients.Group($"call_user:{participant.UserId}").SendAsync("HostTransferred", new { callId = callId, newHostId = newHostUserId });
            }
        }

        public async Task AddMemberToCall(Guid callId, Guid targetUserId)
        {
            var userId = GetUserId();
            var call = await _callService.GetCallDetailsAsync(callId);
            if (call == null) return;

            var callerParticipant = call.Participants.FirstOrDefault(p => p.UserId == userId);
            if (callerParticipant == null || (callerParticipant.Role != "Host" && callerParticipant.Role != "Caller" && call.CallerId != userId))
            {
                throw new HubException("Only the Call Host can add participants.");
            }

            await _callService.AddParticipantAsync(callId, targetUserId);

            // Notify target user
            var callerProfile = await _dbContext.Users.FindAsync(userId);
            if (callerProfile != null)
            {
                await Clients.Group($"call_user:{targetUserId}").SendAsync("IncomingGroupCall", new {
                    callId = call.Id,
                    callerId = userId,
                    callerUsername = callerProfile.Username,
                    joinCode = call.JoinCode
                });
            }
        }

        public async Task JoinMeetingById(string joinCode)
        {
            var userId = GetUserId();
            if (userId == Guid.Empty) return;

            var call = await _callService.JoinCallByCodeAsync(joinCode, userId, Context.ConnectionId);

            await Clients.Group($"call_user:{userId}").SendAsync("CallAccepted", new {
                callId = call.Id,
                accepterId = userId,
                connectionId = Context.ConnectionId,
                joinCode = call.JoinCode
            });

            // Notify everyone else in the call to connect WebRTC to the new user
            foreach (var participant in call.Participants.Where(p => p.UserId != userId && p.Status == "Connected"))
            {
                await Clients.Group($"call_user:{participant.UserId}").SendAsync("ParticipantJoinedGroupCall", new {
                    callId = call.Id,
                    participantId = userId
                });
            }
        }

        public async Task StartInstantMeeting()
        {
            var userId = GetUserId();
            if (userId == Guid.Empty) return;

            var call = await _callService.InitiateInstantMeetingAsync(userId, Context.ConnectionId);

            await Clients.Group($"call_user:{userId}").SendAsync("CallAccepted", new {
                callId = call.Id,
                accepterId = userId,
                connectionId = Context.ConnectionId,
                joinCode = call.JoinCode
            });
        }

        private Guid GetUserId()
        {
            var claim = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return Guid.TryParse(claim, out Guid id) ? id : Guid.Empty;
        }
    }
}
