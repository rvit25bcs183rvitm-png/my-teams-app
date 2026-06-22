using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class DeliveryReceipt
    {
        public Guid MessageId { get; set; }
        public Message Message { get; set; } = null!;
        public Guid UserId { get; set; }
        public User User { get; set; } = null!;
        public DateTimeOffset DeliveryTime { get; set; } = DateTimeOffset.UtcNow;
    }
}
