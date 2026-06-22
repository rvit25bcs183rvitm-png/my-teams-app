using PrivateCommPlatform.Api.Models.Entities;
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Services
{
    public interface IStorageService
    {
        // Folder operations
        Task<Folder> CreateFolderAsync(Guid userId, string name, Guid? parentId, string spaceType, Guid? spaceTargetId);
        Task<Folder> RenameFolderAsync(Guid userId, Guid folderId, string newName);
        Task<Folder> MoveFolderAsync(Guid userId, Guid folderId, Guid? targetFolderId);
        Task DeleteFolderAsync(Guid userId, Guid folderId);
        Task RestoreFolderAsync(Guid userId, Guid folderId);

        // File operations
        Task<FileMetadata> UploadFileAsync(Guid userId, string fileName, string mimeType, long fileSize, Stream fileStream, Guid? folderId, string spaceType, Guid? spaceTargetId);
        Task<FileMetadata> UploadFileVersionAsync(Guid userId, Guid fileId, string mimeType, long fileSize, Stream fileStream);
        Task<(FileVersion Version, string PhysicalPath)> DownloadFileAsync(Guid userId, Guid fileId, int? versionNumber);
        Task<FileMetadata> RenameFileAsync(Guid userId, Guid fileId, string newName);
        Task<FileMetadata> MoveFileAsync(Guid userId, Guid fileId, Guid targetFolderId);
        Task DeleteFileAsync(Guid userId, Guid fileId);
        Task RestoreFileAsync(Guid userId, Guid fileId);

        // Preview operations
        Task<string> GeneratePreviewTokenAsync(Guid userId, Guid fileId);
        Task<(FileVersion Version, string PhysicalPath)> GetPreviewFileByTokenAsync(string token);

        // Version history operations
        Task<List<FileVersion>> GetFileVersionsAsync(Guid userId, Guid fileId);
        Task RestoreFileVersionAsync(Guid userId, Guid fileId, int versionNumber);

        // Sharing operations
        Task ShareFileOrFolderAsync(Guid userId, string recipientType, Guid recipientId, Guid? fileId, Guid? folderId, string permissionLevel, int? expiresInDays);
        
        // Search & Tags operations
        Task<List<FileMetadata>> SearchFilesAsync(Guid userId, string query, string? tagFilter);
        Task AddTagToFileAsync(Guid userId, Guid fileId, string tag);
        Task RemoveTagFromFileAsync(Guid userId, Guid fileId, string tag);

        // Quotas operations
        Task<(long UsedBytes, long LimitBytes)> GetUserQuotaAsync(Guid userId);
        Task<(long UsedBytes, long LimitBytes)> GetTeamQuotaAsync(Guid teamId);

        // Navigation helper
        Task<List<Folder>> GetSubFoldersAsync(Guid userId, Guid? parentId, string spaceType, Guid? spaceTargetId);
        Task<List<FileMetadata>> GetFilesAsync(Guid userId, Guid? folderId, string spaceType, Guid? spaceTargetId);
    }
}
