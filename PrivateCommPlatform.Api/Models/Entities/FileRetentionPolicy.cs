using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class FileRetentionPolicy
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public int RetentionPeriodDays { get; set; }
        public string Action { get; set; } = "Delete"; // Delete, Archive
        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    }
}
