using System;
using System.Collections.Generic;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class Folder
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public Guid? ParentId { get; set; }
        public Folder? Parent { get; set; }
        public Guid OwnerId { get; set; }
        public string SpaceType { get; set; } = "Personal"; // Personal, Team, Family
        public Guid? SpaceTargetId { get; set; } // TeamId, FamilyId, etc.
        public bool IsDeleted { get; set; }
        public DateTimeOffset? DeletedAt { get; set; }
        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
        public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

        public ICollection<Folder> SubFolders { get; set; } = new List<Folder>();
        public ICollection<FileMetadata> Files { get; set; } = new List<FileMetadata>();
    }
}
