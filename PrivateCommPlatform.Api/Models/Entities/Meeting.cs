using System;
using System.Collections.Generic;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class Meeting
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public Guid OrganizerId { get; set; }
        public Guid? ConversationId { get; set; }
        public string MeetingCode { get; set; } = string.Empty; // e.g. abc-defg-hij
        
        public DateTimeOffset? ScheduledStart { get; set; }
        public DateTimeOffset? ScheduledEnd { get; set; }
        public DateTimeOffset? ActualStart { get; set; }
        public DateTimeOffset? ActualEnd { get; set; }
        
        public int MaxParticipants { get; set; } = 20; // Phase 1 limit
        public bool IsLocked { get; set; } = false;
        public bool WaitingRoom { get; set; } = false;
        
        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

        // Navigation properties
        public User Organizer { get; set; } = null!;
        public Conversation? Conversation { get; set; }
    }
}
