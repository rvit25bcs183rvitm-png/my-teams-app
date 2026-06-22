using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class FileShare
    {
        public Guid Id { get; set; }
        public Guid SharedBy { get; set; }
        public string RecipientType { get; set; } = "User"; // User, Team, Group
        public Guid RecipientId { get; set; } // Target UserId, TeamId, or GroupId
        public Guid? FileId { get; set; }
        public FileMetadata? File { get; set; }
        public Guid? FolderId { get; set; }
        public Folder? Folder { get; set; }
        public string PermissionLevel { get; set; } = "Viewer"; // Viewer, Editor, Owner
        public string? ShareLinkToken { get; set; }
        public DateTimeOffset? ExpiresAt { get; set; }
        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    }
}
