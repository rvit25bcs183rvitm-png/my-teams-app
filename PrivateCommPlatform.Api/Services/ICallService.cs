using PrivateCommPlatform.Api.Models.Entities;
using System;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Services
{
    public class CallingEligibilityResult
    {
        public bool IsEligible { get; set; }
        public string Reason { get; set; } = string.Empty;
    }

    public interface ICallService
    {
        Task<CallingEligibilityResult> VerifyCallingEligibilityAsync(Guid callerId, Guid targetUserId);
        Task<Call> InitiateCallAsync(Guid callerId, Guid targetUserId, string type, string connectionId);
        Task<Call> InitiateGroupCallAsync(Guid callerId, Guid conversationId, string connectionId);
        Task<Call> AcceptCallAsync(Guid callId, Guid userId, string connectionId);
        Task<Call> RejectCallAsync(Guid callId, Guid userId, string reason);
        Task<Call> EndCallAsync(Guid callId, Guid userId);
        Task LogCallEventAsync(Guid callId, Guid? userId, string eventType, string details);
        Task HandleDeviceDisconnectAsync(Guid userId, string connectionId);
        Task SubmitCallStatisticsAsync(Guid callId, Guid userId, CallStatistic stats);
        Task SaveCallRatingAsync(Guid callId, Guid userId, int rating, string? feedback);
        Task<Call?> GetCallDetailsAsync(Guid callId);
        Task<Call?> GetActiveCallForUserAsync(Guid userId);
        Task HandleCallTimeoutAsync(Guid callId);
        Task RemoveParticipantAsync(Guid callId, Guid userId);
        Task LockCallSessionAsync(Guid callId, bool isLocked);
        Task TransferCallHostAsync(Guid callId, Guid currentHostId, Guid newHostId);
        Task<Call> AddParticipantAsync(Guid callId, Guid targetUserId);
        Task<Call> JoinCallByCodeAsync(string joinCode, Guid userId, string connectionId);
        Task<Call> InitiateInstantMeetingAsync(Guid hostId, string connectionId);
    }
}
