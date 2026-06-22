using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class FileTag
    {
        public Guid FileId { get; set; }
        public FileMetadata File { get; set; } = null!;
        public string Tag { get; set; } = string.Empty;
    }
}
