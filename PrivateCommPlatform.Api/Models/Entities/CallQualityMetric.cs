using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class CallQualityMetric
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CallId { get; set; }
        public Guid UserId { get; set; }
        
        public decimal? PacketLoss { get; set; } // percentage 0-100
        public decimal? Jitter { get; set; } // milliseconds
        public int? RTT { get; set; } // milliseconds round-trip
        public int? Latency { get; set; } // milliseconds one-way
        public int? Bitrate { get; set; } // kbps
        public string? Resolution { get; set; } // e.g. 1280x720
        public int? FrameRate { get; set; }
        public string? IceType { get; set; } // host | srflx | relay
        
        public DateTimeOffset RecordedAt { get; set; } = DateTimeOffset.UtcNow;

        // Navigation properties
        public Call Call { get; set; } = null!;
        public User User { get; set; } = null!;
    }
}
