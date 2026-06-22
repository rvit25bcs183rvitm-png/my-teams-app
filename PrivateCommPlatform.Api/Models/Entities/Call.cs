using System;
using System.Collections.Generic;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class Call
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid? ConversationId { get; set; }
        public Guid? MeetingId { get; set; }
        public Guid CallerId { get; set; }
        public DateTimeOffset StartTime { get; set; } = DateTimeOffset.UtcNow;
        public DateTimeOffset? EndTime { get; set; }
        public int? Duration { get; set; } // in seconds
        public string Status { get; set; } = "Initiated"; // Initiated, Ringing, Connected, Completed, Rejected, Busy, Cancelled, Failed
        public string Type { get; set; } = "OneToOne"; // OneToOne, Group, Conference
        
        public string? JoinCode { get; set; } // 9-digit code like "123 456 789"
        
        // Quality Telemetry
        public int? UserRating { get; set; } // 1-5 Star Rating
        public string? UserFeedback { get; set; } // Optional short feedback text

        public bool IsLocked { get; set; }
        
        // Navigation properties
        public User Caller { get; set; } = null!;
        public Conversation? Conversation { get; set; }
        public Meeting? Meeting { get; set; }
        public ICollection<CallParticipant> Participants { get; set; } = new List<CallParticipant>();
        public ICollection<CallEvent> Events { get; set; } = new List<CallEvent>();
    }
}
