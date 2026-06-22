using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class FileVersion
    {
        public Guid Id { get; set; }
        public Guid FileId { get; set; }
        public FileMetadata File { get; set; } = null!;
        public int VersionNumber { get; set; }
        public string PhysicalPath { get; set; } = string.Empty;
        public string HashValue { get; set; } = string.Empty; // SHA-256 Hash
        public long FileSize { get; set; }
        public string MimeType { get; set; } = string.Empty;
        public Guid UploadedBy { get; set; }
        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    }
}
