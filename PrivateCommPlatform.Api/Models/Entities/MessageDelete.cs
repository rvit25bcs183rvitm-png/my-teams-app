using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class MessageDelete
    {
        public Guid MessageId { get; set; }
        public Message Message { get; set; } = null!;
        public Guid DeletedById { get; set; }
        public User DeletedBy { get; set; } = null!;
        public DateTimeOffset DeletedDate { get; set; } = DateTimeOffset.UtcNow;
        public string DeleteType { get; set; } = "Everyone"; // Self, Everyone
    }
}
