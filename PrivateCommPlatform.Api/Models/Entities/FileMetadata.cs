using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;

namespace PrivateCommPlatform.Api.Models.Entities
{
    [Table("Files")]
    public class FileMetadata
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public Guid FolderId { get; set; }
        public Folder Folder { get; set; } = null!;
        public Guid OwnerId { get; set; }
        public User Owner { get; set; } = null!;
        public string SpaceType { get; set; } = "Personal"; // Personal, Team, Family
        public Guid? SpaceTargetId { get; set; } // TeamId, FamilyId, etc.
        public Guid? CurrentVersionId { get; set; }
        public FileVersion? CurrentVersion { get; set; }
        public bool IsDeleted { get; set; }
        public DateTimeOffset? DeletedAt { get; set; }
        public Guid? RetentionPolicyId { get; set; }
        public FileRetentionPolicy? RetentionPolicy { get; set; }
        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
        public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

        public ICollection<FileVersion> Versions { get; set; } = new List<FileVersion>();
        public ICollection<FilePermission> Permissions { get; set; } = new List<FilePermission>();
        public ICollection<FileShare> Shares { get; set; } = new List<FileShare>();
        public ICollection<FileTag> Tags { get; set; } = new List<FileTag>();
    }
}
