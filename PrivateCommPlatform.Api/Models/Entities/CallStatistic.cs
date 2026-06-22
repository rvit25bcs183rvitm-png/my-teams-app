using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class CallStatistic
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CallId { get; set; }
        public Guid UserId { get; set; }
        public long PacketsSent { get; set; }
        public long PacketsReceived { get; set; }
        public long BytesSent { get; set; }
        public long BytesReceived { get; set; }
        public double JitterMs { get; set; }
        public double PacketLossRate { get; set; }
        public double RttMs { get; set; }
        public double BitrateBps { get; set; }
        public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;

        public Call Call { get; set; } = null!;
        public User User { get; set; } = null!;
    }
}
