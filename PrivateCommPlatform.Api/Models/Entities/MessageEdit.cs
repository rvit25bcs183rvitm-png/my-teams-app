using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class MessageEdit
    {
        public Guid Id { get; set; }
        public Guid MessageId { get; set; }
        public Message Message { get; set; } = null!;
        public string OriginalContent { get; set; } = string.Empty;
        public DateTimeOffset EditedDate { get; set; } = DateTimeOffset.UtcNow;
    }
}
