using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class FilePermission
    {
        public Guid Id { get; set; }
        public Guid? FileId { get; set; }
        public FileMetadata? File { get; set; }
        public Guid? FolderId { get; set; }
        public Folder? Folder { get; set; }
        public Guid? UserId { get; set; }
        public string? RoleName { get; set; }
        public string PermissionLevel { get; set; } = "Viewer"; // Viewer, Editor, Owner
        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
        public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    }
}
