using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class ReadReceipt
    {
        public Guid MessageId { get; set; }
        public Message Message { get; set; } = null!;
        public Guid UserId { get; set; }
        public User User { get; set; } = null!;
        public DateTimeOffset ReadTime { get; set; } = DateTimeOffset.UtcNow;
    }
}
