using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class FileAuditLog
    {
        public Guid Id { get; set; }
        public Guid ActorId { get; set; }
        public string Action { get; set; } = string.Empty; // Upload, Download, Delete, Restore, Share, PermissionChange, VersionRestore
        public Guid? FileId { get; set; }
        public Guid? FolderId { get; set; }
        public Guid? VersionId { get; set; }
        public string IpAddress { get; set; } = string.Empty;
        public string? UserAgent { get; set; }
        public string Details { get; set; } = "{}"; // JSON string representation
        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    }
}
