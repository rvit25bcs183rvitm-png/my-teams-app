using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using PrivateCommPlatform.Api.Data;
using PrivateCommPlatform.Api.Models.Entities;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Services
{
    public class StorageService : IStorageService
    {
        private readonly ApplicationDbContext _dbContext;
        private readonly IHttpContextAccessor _httpContextAccessor;

        public StorageService(ApplicationDbContext dbContext, IHttpContextAccessor httpContextAccessor)
        {
            _dbContext = dbContext;
            _httpContextAccessor = httpContextAccessor;
        }

        // ==========================================
        // HELPERS
        // ==========================================
        private string GetPhysicalStoragePath()
        {
            var baseDirectory = "D:\\PlatformStorage";
            if (!Directory.Exists("D:\\"))
            {
                // Fallback to local project directory in development if D: drive doesn't exist
                baseDirectory = Path.Combine(Directory.GetCurrentDirectory(), "PlatformStorage");
            }
            if (!Directory.Exists(baseDirectory))
            {
                Directory.CreateDirectory(baseDirectory);
            }
            return baseDirectory;
        }

        private string GetClientIpAddress() =>
            _httpContextAccessor.HttpContext?.Connection?.RemoteIpAddress?.ToString() ?? "0.0.0.0";

        private string GetUserAgent() =>
            _httpContextAccessor.HttpContext?.Request?.Headers["User-Agent"].ToString() ?? "Unknown";

        private bool IsExtensionBlocked(string fileName)
        {
            var ext = Path.GetExtension(fileName).ToLowerInvariant();
            var blocklist = new List<string> { ".exe", ".bat", ".cmd", ".scr", ".msi", ".vbs", ".js", ".sh", ".lnk", ".dll", ".sys", ".ps1" };
            return blocklist.Contains(ext);
        }

        private bool IsMimeTypeValid(Stream stream, string declaredMime)
        {
            byte[] buffer = new byte[8];
            int readBytes = stream.Read(buffer, 0, 8);
            if (stream.CanSeek)
            {
                stream.Position = 0; // Reset stream position
            }

            // Allow small files (text files, etc.) — they don't have recognizable magic bytes
            if (readBytes < 4) return true;

            // PDF
            if (buffer[0] == 0x25 && buffer[1] == 0x50 && buffer[2] == 0x44 && buffer[3] == 0x46)
                return declaredMime.Contains("pdf");
            // PNG
            if (buffer[0] == 0x89 && buffer[1] == 0x50 && buffer[2] == 0x4E && buffer[3] == 0x47)
                return declaredMime.Contains("png");
            // JPEG/JPG
            if (buffer[0] == 0xFF && buffer[1] == 0xD8 && buffer[2] == 0xFF)
                return declaredMime.Contains("jpeg") || declaredMime.Contains("jpg") || declaredMime.Contains("image");
            // ZIP/Office (docx, xlsx, pptx are all ZIP-based)
            if (buffer[0] == 0x50 && buffer[1] == 0x4B && buffer[2] == 0x03 && buffer[3] == 0x04)
                return declaredMime.Contains("zip") || declaredMime.Contains("officedocument") || declaredMime.Contains("ms-") || declaredMime.Contains("application");
            // RIFF (WAV/WEBP/AVI)
            if (buffer[0] == 0x52 && buffer[1] == 0x49 && buffer[2] == 0x46 && buffer[3] == 0x46)
                return declaredMime.Contains("wav") || declaredMime.Contains("webp") || declaredMime.Contains("avi") || declaredMime.Contains("video") || declaredMime.Contains("audio");
            // MP3 (ID3 tag)
            if (buffer[0] == 0x49 && buffer[1] == 0x44 && buffer[2] == 0x33)
                return declaredMime.Contains("mpeg") || declaredMime.Contains("mp3") || declaredMime.Contains("audio");
            // GIF
            if (buffer[0] == 0x47 && buffer[1] == 0x49 && buffer[2] == 0x46)
                return declaredMime.Contains("gif") || declaredMime.Contains("image");
            // MP4/MOV (ftyp box)
            if (readBytes >= 8 && buffer[4] == 0x66 && buffer[5] == 0x74 && buffer[6] == 0x79 && buffer[7] == 0x70)
                return declaredMime.Contains("mp4") || declaredMime.Contains("video") || declaredMime.Contains("quicktime");
            // BMP
            if (buffer[0] == 0x42 && buffer[1] == 0x4D)
                return declaredMime.Contains("bmp") || declaredMime.Contains("image");

            // For unrecognized magic bytes (text files, CSV, JSON, etc.), allow upload
            return true;
        }

        private async Task LogAuditAsync(Guid actorId, string action, Guid? fileId, Guid? folderId, Guid? versionId, object details)
        {
            var auditLog = new FileAuditLog
            {
                Id = Guid.NewGuid(),
                ActorId = actorId,
                Action = action,
                FileId = fileId,
                FolderId = folderId,
                VersionId = versionId,
                IpAddress = GetClientIpAddress(),
                UserAgent = GetUserAgent(),
                Details = JsonSerializer.Serialize(details),
                CreatedAt = DateTimeOffset.UtcNow
            };

            _dbContext.FileAuditLogs.Add(auditLog);
            await _dbContext.SaveChangesAsync();
        }

        private async Task<string> GetUserPermissionLevelAsync(Guid userId, Folder? folder, FileMetadata? file)
        {
            Guid? fileId = file?.Id;
            Guid? folderId = file?.FolderId ?? folder?.Id;

            // Owners have Owner access
            if (file != null && file.OwnerId == userId) return "Owner";
            if (folder != null && folder.OwnerId == userId) return "Owner";

            // Check direct FilePermissions
            var directPerm = await _dbContext.FilePermissions
                .AsNoTracking()
                .FirstOrDefaultAsync(p => (fileId != null && p.FileId == fileId && p.UserId == userId)
                                       || (folderId != null && p.FolderId == folderId && p.UserId == userId));
            if (directPerm != null) return directPerm.PermissionLevel;

            // Check explicit FileShares
            var directShare = await _dbContext.FileShares
                .AsNoTracking()
                .FirstOrDefaultAsync(s => ((fileId != null && s.FileId == fileId) || (folderId != null && s.FolderId == folderId))
                                       && s.RecipientType == "User" && s.RecipientId == userId
                                       && (s.ExpiresAt == null || s.ExpiresAt > DateTimeOffset.UtcNow));
            if (directShare != null) return directShare.PermissionLevel;

            // Check Team Space inheritance
            var spaceType = file?.SpaceType ?? folder?.SpaceType;
            var spaceTargetId = file?.SpaceTargetId ?? folder?.SpaceTargetId;

            if (spaceType == "Team" && spaceTargetId.HasValue)
            {
                var channelMember = await _dbContext.ConversationMembers
                    .AsNoTracking()
                    .FirstOrDefaultAsync(cm => cm.ConversationId == spaceTargetId.Value && cm.UserId == userId);
                if (channelMember != null)
                {
                    if (channelMember.Role == "Owner" || channelMember.Role == "Admin")
                        return "Owner";
                    return "Editor";
                }
            }

            // Check parent folders recursive tree
            if (folderId.HasValue)
            {
                var currentFolder = folder ?? await _dbContext.Folders.FindAsync(folderId.Value);
                while (currentFolder != null && currentFolder.ParentId.HasValue)
                {
                    var parentFolder = await _dbContext.Folders.FindAsync(currentFolder.ParentId.Value);
                    if (parentFolder == null) break;

                    if (parentFolder.OwnerId == userId) return "Owner";

                    var parentPerm = await _dbContext.FilePermissions
                        .AsNoTracking()
                        .FirstOrDefaultAsync(p => p.FolderId == parentFolder.Id && p.UserId == userId);
                    if (parentPerm != null) return parentPerm.PermissionLevel;

                    var parentShare = await _dbContext.FileShares
                        .AsNoTracking()
                        .FirstOrDefaultAsync(s => s.FolderId == parentFolder.Id 
                                               && s.RecipientType == "User" && s.RecipientId == userId
                                               && (s.ExpiresAt == null || s.ExpiresAt > DateTimeOffset.UtcNow));
                    if (parentShare != null) return parentShare.PermissionLevel;

                    currentFolder = parentFolder;
                }
            }

            // Check Admin role override
            var user = await _dbContext.Users.AsNoTracking().Include(u => u.UserRoles).ThenInclude(ur => ur.Role).FirstOrDefaultAsync(u => u.Id == userId);
            if (user != null && user.UserRoles.Any(ur => ur.Role.Name == "Super Administrator" || ur.Role.Name == "Administrator"))
            {
                return "Owner";
            }

            return "None";
        }

        private async Task ValidateAccessAsync(Guid userId, Folder? folder, FileMetadata? file, string minLevel)
        {
            var level = await GetUserPermissionLevelAsync(userId, folder, file);
            if (level == "None") throw new UnauthorizedAccessException("403 Forbidden");

            if (minLevel == "Owner" && level != "Owner")
                throw new UnauthorizedAccessException("403 Forbidden");
            if (minLevel == "Editor" && level != "Owner" && level != "Editor")
                throw new UnauthorizedAccessException("403 Forbidden");
        }

        private async Task<bool> IsFileOwnerOrAdminAsync(Guid userId, FileMetadata file)
        {
            if (file.OwnerId == userId) return true;

            // Check Admin role override
            var user = await _dbContext.Users.AsNoTracking().Include(u => u.UserRoles).ThenInclude(ur => ur.Role).FirstOrDefaultAsync(u => u.Id == userId);
            return user != null && user.UserRoles.Any(ur => ur.Role.Name == "Super Administrator" || ur.Role.Name == "Administrator");
        }

        private async Task<bool> IsFolderOwnerOrAdminAsync(Guid userId, Folder folder)
        {
            if (folder.OwnerId == userId) return true;

            // Check Admin role override
            var user = await _dbContext.Users.AsNoTracking().Include(u => u.UserRoles).ThenInclude(ur => ur.Role).FirstOrDefaultAsync(u => u.Id == userId);
            return user != null && user.UserRoles.Any(ur => ur.Role.Name == "Super Administrator" || ur.Role.Name == "Administrator");
        }

        // ==========================================
        // FOLDERS IMPLEMENTATION
        // ==========================================
        public async Task<Folder> CreateFolderAsync(Guid userId, string name, Guid? parentId, string spaceType, Guid? spaceTargetId)
        {
            if (parentId.HasValue)
            {
                var parent = await _dbContext.Folders.FindAsync(parentId.Value);
                if (parent == null) throw new ArgumentException("Parent folder not found.");
                await ValidateAccessAsync(userId, parent, null, "Editor");
            }

            var folder = new Folder
            {
                Id = Guid.NewGuid(),
                Name = name,
                ParentId = parentId,
                OwnerId = userId,
                SpaceType = spaceType,
                SpaceTargetId = spaceTargetId,
                IsDeleted = false,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };

            _dbContext.Folders.Add(folder);
            await _dbContext.SaveChangesAsync();

            await LogAuditAsync(userId, "PermissionChange", null, folder.Id, null, new { Action = "CreateFolder", FolderName = name });
            return folder;
        }

        public async Task<Folder> RenameFolderAsync(Guid userId, Guid folderId, string newName)
        {
            var folder = await _dbContext.Folders.FindAsync(folderId);
            if (folder == null) throw new KeyNotFoundException("Folder not found.");
            
            if (folder.SpaceType == "Team")
            {
                if (!await IsFolderOwnerOrAdminAsync(userId, folder))
                {
                    throw new UnauthorizedAccessException("403 Forbidden: Only the folder owner can rename this folder.");
                }
            }
            else
            {
                await ValidateAccessAsync(userId, folder, null, "Editor");
            }

            var oldName = folder.Name;
            folder.Name = newName;
            folder.UpdatedAt = DateTimeOffset.UtcNow;
            await _dbContext.SaveChangesAsync();

            await LogAuditAsync(userId, "PermissionChange", null, folder.Id, null, new { Action = "RenameFolder", OldName = oldName, NewName = newName });
            return folder;
        }

        public async Task<Folder> MoveFolderAsync(Guid userId, Guid folderId, Guid? targetFolderId)
        {
            var folder = await _dbContext.Folders.FindAsync(folderId);
            if (folder == null) throw new KeyNotFoundException("Folder not found.");
            
            if (folder.SpaceType == "Team")
            {
                if (!await IsFolderOwnerOrAdminAsync(userId, folder))
                {
                    throw new UnauthorizedAccessException("403 Forbidden: Only the folder owner can move this folder.");
                }
            }
            else
            {
                await ValidateAccessAsync(userId, folder, null, "Editor");
            }

            if (targetFolderId.HasValue)
            {
                if (folderId == targetFolderId.Value) throw new ArgumentException("Cannot move a folder inside itself.");
                var target = await _dbContext.Folders.FindAsync(targetFolderId.Value);
                if (target == null) throw new KeyNotFoundException("Target folder not found.");
                await ValidateAccessAsync(userId, target, null, "Editor");
            }

            var oldParent = folder.ParentId;
            folder.ParentId = targetFolderId;
            folder.UpdatedAt = DateTimeOffset.UtcNow;
            await _dbContext.SaveChangesAsync();

            await LogAuditAsync(userId, "PermissionChange", null, folder.Id, null, new { Action = "MoveFolder", OldParentId = oldParent, NewParentId = targetFolderId });
            return folder;
        }

        public async Task DeleteFolderAsync(Guid userId, Guid folderId)
        {
            var folder = await _dbContext.Folders.FindAsync(folderId);
            if (folder == null) throw new KeyNotFoundException("Folder not found.");
            
            if (folder.SpaceType == "Team")
            {
                if (!await IsFolderOwnerOrAdminAsync(userId, folder))
                {
                    throw new UnauthorizedAccessException("403 Forbidden: Only the folder owner can delete this folder.");
                }
            }
            else
            {
                await ValidateAccessAsync(userId, folder, null, "Editor");
            }

            folder.IsDeleted = true;
            folder.DeletedAt = DateTimeOffset.UtcNow;
            
            // Soft delete contents recursively
            await SoftDeleteFolderContentsAsync(userId, folderId);

            await _dbContext.SaveChangesAsync();
            await LogAuditAsync(userId, "Delete", null, folder.Id, null, new { Action = "DeleteFolder", FolderName = folder.Name });
        }

        private async Task SoftDeleteFolderContentsAsync(Guid userId, Guid parentId)
        {
            var subfolders = await _dbContext.Folders.Where(f => f.ParentId == parentId && !f.IsDeleted).ToListAsync();
            foreach (var sf in subfolders)
            {
                sf.IsDeleted = true;
                sf.DeletedAt = DateTimeOffset.UtcNow;
                await SoftDeleteFolderContentsAsync(userId, sf.Id);
            }

            var files = await _dbContext.Files.Where(f => f.FolderId == parentId && !f.IsDeleted).ToListAsync();
            foreach (var file in files)
            {
                file.IsDeleted = true;
                file.DeletedAt = DateTimeOffset.UtcNow;
            }
        }

        public async Task RestoreFolderAsync(Guid userId, Guid folderId)
        {
            var folder = await _dbContext.Folders.FindAsync(folderId);
            if (folder == null) throw new KeyNotFoundException("Folder not found.");
            await ValidateAccessAsync(userId, folder, null, "Editor");

            folder.IsDeleted = false;
            folder.DeletedAt = null;

            await RestoreFolderContentsAsync(userId, folderId);

            await _dbContext.SaveChangesAsync();
            await LogAuditAsync(userId, "Restore", null, folder.Id, null, new { Action = "RestoreFolder", FolderName = folder.Name });
        }

        private async Task RestoreFolderContentsAsync(Guid userId, Guid parentId)
        {
            var subfolders = await _dbContext.Folders.Where(f => f.ParentId == parentId && f.IsDeleted).ToListAsync();
            foreach (var sf in subfolders)
            {
                sf.IsDeleted = false;
                sf.DeletedAt = null;
                await RestoreFolderContentsAsync(userId, sf.Id);
            }

            var files = await _dbContext.Files.Where(f => f.FolderId == parentId && f.IsDeleted).ToListAsync();
            foreach (var file in files)
            {
                file.IsDeleted = false;
                file.DeletedAt = null;
            }
        }

        // ==========================================
        // FILES IMPLEMENTATION
        // ==========================================
        public async Task<FileMetadata> UploadFileAsync(Guid userId, string fileName, string mimeType, long fileSize, Stream fileStream, Guid? folderId, string spaceType, Guid? spaceTargetId)
        {
            if (IsExtensionBlocked(fileName))
                throw new InvalidOperationException($"Security violation: uploading file extension '{Path.GetExtension(fileName)}' is blocked.");

            // Folder validation
            Folder? parentFolder = null;
            Guid targetFolderId;
            if (folderId.HasValue)
            {
                targetFolderId = folderId.Value;
                parentFolder = await _dbContext.Folders.FindAsync(targetFolderId);
                if (parentFolder == null) throw new ArgumentException("Target folder not found.");
                await ValidateAccessAsync(userId, parentFolder, null, "Editor");
            }
            else
            {
                // Find or create the root folder for this space
                Folder? rootFolder = null;
                if (spaceType == "Personal")
                {
                    rootFolder = await _dbContext.Folders.FirstOrDefaultAsync(f => f.SpaceType == "Personal" && f.OwnerId == userId && f.ParentId == null && f.Name == "Root" && !f.IsDeleted);
                }
                else if (spaceType == "Team")
                {
                    rootFolder = await _dbContext.Folders.FirstOrDefaultAsync(f => f.SpaceType == "Team" && f.SpaceTargetId == spaceTargetId && f.ParentId == null && f.Name == "Root" && !f.IsDeleted);
                }

                if (rootFolder == null)
                {
                    rootFolder = new Folder
                    {
                        Id = Guid.NewGuid(),
                        Name = "Root",
                        ParentId = null,
                        OwnerId = userId,
                        SpaceType = spaceType,
                        SpaceTargetId = spaceTargetId,
                        IsDeleted = false,
                        CreatedAt = DateTimeOffset.UtcNow,
                        UpdatedAt = DateTimeOffset.UtcNow
                    };
                    _dbContext.Folders.Add(rootFolder);
                    await _dbContext.SaveChangesAsync();
                }
                targetFolderId = rootFolder.Id;
            }

            // Create temp file to compute hash
            var tempPath = Path.Combine(GetPhysicalStoragePath(), $"temp_{Guid.NewGuid()}");
            string hashValue;
            try
            {
                using (var fs = new FileStream(tempPath, FileMode.Create, FileAccess.Write))
                {
                    await fileStream.CopyToAsync(fs);
                }

                // Verify MIME type on seekable temp file stream
                using (var fs = File.OpenRead(tempPath))
                {
                    if (!IsMimeTypeValid(fs, mimeType))
                    {
                        fs.Close();
                        try { File.Delete(tempPath); } catch {}
                        throw new InvalidOperationException("Security violation: magic bytes do not match declared MIME type.");
                    }
                }
            }
            catch (Exception)
            {
                try { File.Delete(tempPath); } catch {}
                throw;
            }

            // Compute hash
            using (var sha = SHA256.Create())
            {
                using var fs = File.OpenRead(tempPath);
                var hashBytes = sha.ComputeHash(fs);
                var sb = new StringBuilder();
                foreach (var b in hashBytes) sb.Append(b.ToString("x2"));
                hashValue = sb.ToString();
            }

            // Check if version with hash already exists
            var existingVersion = await _dbContext.FileVersions.FirstOrDefaultAsync(v => v.HashValue == hashValue);
            string finalPhysicalPath;
            if (existingVersion != null)
            {
                // Deduplicate: delete temp file and point to existing physical file
                File.Delete(tempPath);
                finalPhysicalPath = existingVersion.PhysicalPath;
            }
            else
            {
                // Move temp file to final storage named by hash
                finalPhysicalPath = Path.Combine(GetPhysicalStoragePath(), hashValue);
                if (File.Exists(finalPhysicalPath))
                {
                    File.Delete(tempPath); // Just in case
                }
                else
                {
                    File.Move(tempPath, finalPhysicalPath);
                }
            }

            // Insert File Metadata
            var file = new FileMetadata
            {
                Id = Guid.NewGuid(),
                Name = fileName,
                FolderId = targetFolderId,
                OwnerId = userId,
                SpaceType = spaceType,
                SpaceTargetId = spaceTargetId,
                IsDeleted = false,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };

            _dbContext.Files.Add(file);
            await _dbContext.SaveChangesAsync();

            // Insert File Version
            var fileVersion = new FileVersion
            {
                Id = Guid.NewGuid(),
                FileId = file.Id,
                VersionNumber = 1,
                PhysicalPath = finalPhysicalPath,
                HashValue = hashValue,
                FileSize = fileSize,
                MimeType = mimeType,
                UploadedBy = userId,
                CreatedAt = DateTimeOffset.UtcNow
            };

            _dbContext.FileVersions.Add(fileVersion);
            await _dbContext.SaveChangesAsync();

            file.CurrentVersionId = fileVersion.Id;
            await _dbContext.SaveChangesAsync();

            await LogAuditAsync(userId, "Upload", file.Id, file.FolderId, fileVersion.Id, new { FileName = fileName, FileSize = fileSize, Version = 1 });
            return file;
        }

        public async Task<FileMetadata> UploadFileVersionAsync(Guid userId, Guid fileId, string mimeType, long fileSize, Stream fileStream)
        {
            var file = await _dbContext.Files.Include(f => f.Versions).FirstOrDefaultAsync(f => f.Id == fileId);
            if (file == null) throw new KeyNotFoundException("File not found.");
            
            if (file.SpaceType == "Team")
            {
                if (!await IsFileOwnerOrAdminAsync(userId, file))
                {
                    throw new UnauthorizedAccessException("403 Forbidden: Only the file owner can upload new versions of this file.");
                }
            }
            else
            {
                await ValidateAccessAsync(userId, null, file, "Editor");
            }

            if (IsExtensionBlocked(file.Name))
                throw new InvalidOperationException("Blocked file extension.");

            // Temp file to compute hash
            var tempPath = Path.Combine(GetPhysicalStoragePath(), $"temp_{Guid.NewGuid()}");
            string hashValue;
            try
            {
                using (var fs = new FileStream(tempPath, FileMode.Create, FileAccess.Write))
                {
                    await fileStream.CopyToAsync(fs);
                }

                // Verify MIME type on seekable temp file stream
                using (var fs = File.OpenRead(tempPath))
                {
                    if (!IsMimeTypeValid(fs, mimeType))
                    {
                        fs.Close();
                        try { File.Delete(tempPath); } catch {}
                        throw new InvalidOperationException("Invalid magic bytes.");
                    }
                }
            }
            catch (Exception)
            {
                try { File.Delete(tempPath); } catch {}
                throw;
            }

            using (var sha = SHA256.Create())
            {
                using var fs = File.OpenRead(tempPath);
                var hashBytes = sha.ComputeHash(fs);
                var sb = new StringBuilder();
                foreach (var b in hashBytes) sb.Append(b.ToString("x2"));
                hashValue = sb.ToString();
            }

            var existingVersion = await _dbContext.FileVersions.FirstOrDefaultAsync(v => v.HashValue == hashValue);
            string finalPhysicalPath;
            if (existingVersion != null)
            {
                File.Delete(tempPath);
                finalPhysicalPath = existingVersion.PhysicalPath;
            }
            else
            {
                finalPhysicalPath = Path.Combine(GetPhysicalStoragePath(), hashValue);
                if (File.Exists(finalPhysicalPath))
                {
                    File.Delete(tempPath);
                }
                else
                {
                    File.Move(tempPath, finalPhysicalPath);
                }
            }

            var nextVersionNumber = file.Versions.Max(v => v.VersionNumber) + 1;

            var fileVersion = new FileVersion
            {
                Id = Guid.NewGuid(),
                FileId = file.Id,
                VersionNumber = nextVersionNumber,
                PhysicalPath = finalPhysicalPath,
                HashValue = hashValue,
                FileSize = fileSize,
                MimeType = mimeType,
                UploadedBy = userId,
                CreatedAt = DateTimeOffset.UtcNow
            };

            _dbContext.FileVersions.Add(fileVersion);
            await _dbContext.SaveChangesAsync();

            file.CurrentVersionId = fileVersion.Id;
            file.UpdatedAt = DateTimeOffset.UtcNow;
            await _dbContext.SaveChangesAsync();

            await LogAuditAsync(userId, "Upload", file.Id, file.FolderId, fileVersion.Id, new { FileName = file.Name, FileSize = fileSize, Version = nextVersionNumber });
            return file;
        }

        public async Task<(FileVersion Version, string PhysicalPath)> DownloadFileAsync(Guid userId, Guid fileId, int? versionNumber)
        {
            var file = await _dbContext.Files.Include(f => f.Versions).FirstOrDefaultAsync(f => f.Id == fileId);
            if (file == null || file.IsDeleted) throw new KeyNotFoundException("File not found.");
            await ValidateAccessAsync(userId, null, file, "Viewer");

            FileVersion? version = null;
            if (versionNumber.HasValue)
            {
                version = file.Versions.FirstOrDefault(v => v.VersionNumber == versionNumber.Value);
            }
            else if (file.CurrentVersionId.HasValue)
            {
                version = file.Versions.FirstOrDefault(v => v.Id == file.CurrentVersionId.Value);
            }

            if (version == null) throw new KeyNotFoundException("Version not found.");

            await LogAuditAsync(userId, "Download", file.Id, file.FolderId, version.Id, new { Action = "Download", VersionNumber = version.VersionNumber });
            return (version, version.PhysicalPath);
        }

        public async Task<FileMetadata> RenameFileAsync(Guid userId, Guid fileId, string newName)
        {
            var file = await _dbContext.Files.FindAsync(fileId);
            if (file == null) throw new KeyNotFoundException("File not found.");
            
            if (file.SpaceType == "Team")
            {
                if (!await IsFileOwnerOrAdminAsync(userId, file))
                {
                    throw new UnauthorizedAccessException("403 Forbidden: Only the file owner can rename this file.");
                }
            }
            else
            {
                await ValidateAccessAsync(userId, null, file, "Editor");
            }

            var oldName = file.Name;
            file.Name = newName;
            file.UpdatedAt = DateTimeOffset.UtcNow;
            await _dbContext.SaveChangesAsync();

            await LogAuditAsync(userId, "PermissionChange", file.Id, file.FolderId, null, new { Action = "RenameFile", OldName = oldName, NewName = newName });
            return file;
        }

        public async Task<FileMetadata> MoveFileAsync(Guid userId, Guid fileId, Guid targetFolderId)
        {
            var file = await _dbContext.Files.FindAsync(fileId);
            if (file == null) throw new KeyNotFoundException("File not found.");
            
            if (file.SpaceType == "Team")
            {
                if (!await IsFileOwnerOrAdminAsync(userId, file))
                {
                    throw new UnauthorizedAccessException("403 Forbidden: Only the file owner can move this file.");
                }
            }
            else
            {
                await ValidateAccessAsync(userId, null, file, "Editor");
            }

            var targetFolder = await _dbContext.Folders.FindAsync(targetFolderId);
            if (targetFolder == null) throw new KeyNotFoundException("Target folder not found.");
            await ValidateAccessAsync(userId, targetFolder, null, "Editor");

            var oldFolderId = file.FolderId;
            file.FolderId = targetFolderId;
            file.UpdatedAt = DateTimeOffset.UtcNow;
            await _dbContext.SaveChangesAsync();

            await LogAuditAsync(userId, "PermissionChange", file.Id, file.FolderId, null, new { Action = "MoveFile", OldFolderId = oldFolderId, NewFolderId = targetFolderId });
            return file;
        }

        public async Task DeleteFileAsync(Guid userId, Guid fileId)
        {
            var file = await _dbContext.Files.FindAsync(fileId);
            if (file == null) throw new KeyNotFoundException("File not found.");
            
            if (file.SpaceType == "Team")
            {
                if (!await IsFileOwnerOrAdminAsync(userId, file))
                {
                    throw new UnauthorizedAccessException("403 Forbidden: Only the file owner can delete this file.");
                }
            }
            else
            {
                await ValidateAccessAsync(userId, null, file, "Editor");
            }

            file.IsDeleted = true;
            file.DeletedAt = DateTimeOffset.UtcNow;
            await _dbContext.SaveChangesAsync();

            await LogAuditAsync(userId, "Delete", file.Id, file.FolderId, file.CurrentVersionId, new { Action = "SoftDeleteFile" });
        }

        public async Task RestoreFileAsync(Guid userId, Guid fileId)
        {
            var file = await _dbContext.Files.FindAsync(fileId);
            if (file == null) throw new KeyNotFoundException("File not found.");
            await ValidateAccessAsync(userId, null, file, "Editor");

            file.IsDeleted = false;
            file.DeletedAt = null;
            await _dbContext.SaveChangesAsync();

            await LogAuditAsync(userId, "Restore", file.Id, file.FolderId, file.CurrentVersionId, new { Action = "RestoreFile" });
        }

        // ==========================================
        // PREVIEW TOKEN SECURITY
        // ==========================================
        public async Task<string> GeneratePreviewTokenAsync(Guid userId, Guid fileId)
        {
            var file = await _dbContext.Files.FindAsync(fileId);
            if (file == null || file.IsDeleted) throw new KeyNotFoundException("File not found.");
            await ValidateAccessAsync(userId, null, file, "Viewer");

            // Create a short-lived token using JWT structure or custom encrypted model
            // For simplicity, we create a secure share link token in FileShares valid for 5 minutes
            var share = new Models.Entities.FileShare
            {
                Id = Guid.NewGuid(),
                SharedBy = userId,
                RecipientType = "User",
                RecipientId = userId,
                FileId = fileId,
                PermissionLevel = "Viewer",
                ShareLinkToken = Guid.NewGuid().ToString("N"),
                ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(5),
                CreatedAt = DateTimeOffset.UtcNow
            };

            _dbContext.FileShares.Add(share);
            await _dbContext.SaveChangesAsync();

            return share.ShareLinkToken;
        }

        public async Task<(FileVersion Version, string PhysicalPath)> GetPreviewFileByTokenAsync(string token)
        {
            var share = await _dbContext.FileShares
                .Include(s => s.File)
                .ThenInclude(f => f!.Versions)
                .FirstOrDefaultAsync(s => s.ShareLinkToken == token && (s.ExpiresAt == null || s.ExpiresAt > DateTimeOffset.UtcNow));

            if (share == null || share.File == null || share.File.IsDeleted)
                throw new UnauthorizedAccessException("403 Forbidden: Invalid or expired preview token.");

            var version = share.File.Versions.FirstOrDefault(v => v.Id == share.File.CurrentVersionId);
            if (version == null) throw new KeyNotFoundException("Current file version not found.");

            // Log Preview Audit event
            await LogAuditAsync(share.SharedBy, "Download", share.File.Id, share.File.FolderId, version.Id, new { Action = "InlinePreview", TokenUsed = token });
            return (version, version.PhysicalPath);
        }

        // ==========================================
        // VERSION RESTORATION
        // ==========================================
        public async Task<List<FileVersion>> GetFileVersionsAsync(Guid userId, Guid fileId)
        {
            var file = await _dbContext.Files.Include(f => f.Versions).FirstOrDefaultAsync(f => f.Id == fileId);
            if (file == null) throw new KeyNotFoundException("File not found.");
            await ValidateAccessAsync(userId, null, file, "Viewer");

            return file.Versions.OrderByDescending(v => v.VersionNumber).ToList();
        }

        public async Task RestoreFileVersionAsync(Guid userId, Guid fileId, int versionNumber)
        {
            var file = await _dbContext.Files.Include(f => f.Versions).FirstOrDefaultAsync(f => f.Id == fileId);
            if (file == null) throw new KeyNotFoundException("File not found.");
            await ValidateAccessAsync(userId, null, file, "Editor");

            var targetVersion = file.Versions.FirstOrDefault(v => v.VersionNumber == versionNumber);
            if (targetVersion == null) throw new KeyNotFoundException("Target version not found.");

            file.CurrentVersionId = targetVersion.Id;
            file.UpdatedAt = DateTimeOffset.UtcNow;
            await _dbContext.SaveChangesAsync();

            await LogAuditAsync(userId, "VersionRestore", file.Id, file.FolderId, targetVersion.Id, new { RestoredToVersion = versionNumber });
        }

        // ==========================================
        // SHARING SYSTEM
        // ==========================================
        public async Task ShareFileOrFolderAsync(Guid userId, string recipientType, Guid recipientId, Guid? fileId, Guid? folderId, string permissionLevel, int? expiresInDays)
        {
            if (fileId.HasValue)
            {
                var file = await _dbContext.Files.FindAsync(fileId.Value);
                if (file == null) throw new KeyNotFoundException("File not found.");
                await ValidateAccessAsync(userId, null, file, "Owner"); // Only Owners can share
            }
            else if (folderId.HasValue)
            {
                var folder = await _dbContext.Folders.FindAsync(folderId.Value);
                if (folder == null) throw new KeyNotFoundException("Folder not found.");
                await ValidateAccessAsync(userId, folder, null, "Owner");
            }
            else
            {
                throw new ArgumentException("Must specify either fileId or folderId to share.");
            }

            var share = new Models.Entities.FileShare
            {
                Id = Guid.NewGuid(),
                SharedBy = userId,
                RecipientType = recipientType,
                RecipientId = recipientId,
                FileId = fileId,
                FolderId = folderId,
                PermissionLevel = permissionLevel,
                ExpiresAt = expiresInDays.HasValue ? DateTimeOffset.UtcNow.AddDays(expiresInDays.Value) : null,
                CreatedAt = DateTimeOffset.UtcNow
            };

            _dbContext.FileShares.Add(share);
            await _dbContext.SaveChangesAsync();

            await LogAuditAsync(userId, "Share", fileId, folderId, null, new { SharedWith = recipientType, RecipientId = recipientId, Level = permissionLevel });
        }

        // ==========================================
        // SEARCH AND TAGS
        // ==========================================
        public async Task<List<FileMetadata>> SearchFilesAsync(Guid userId, string query, string? tagFilter)
        {
            var filesQuery = _dbContext.Files
                .Include(f => f.Versions)
                .Include(f => f.Tags)
                .Where(f => !f.IsDeleted);

            // Filter by search query (T-SQL CONTAINS / LIKE comparison as fallback)
            if (!string.IsNullOrWhiteSpace(query))
            {
                filesQuery = filesQuery.Where(f => f.Name.Contains(query));
            }

            if (!string.IsNullOrWhiteSpace(tagFilter))
            {
                filesQuery = filesQuery.Where(f => f.Tags.Any(t => t.Tag == tagFilter));
            }

            var matchingFiles = await filesQuery.ToListAsync();

            // Perform post-query security validation
            var authorizedFiles = new List<FileMetadata>();
            foreach (var file in matchingFiles)
            {
                var perm = await GetUserPermissionLevelAsync(userId, null, file);
                if (perm != "None")
                {
                    authorizedFiles.Add(file);
                }
            }

            return authorizedFiles;
        }

        public async Task AddTagToFileAsync(Guid userId, Guid fileId, string tag)
        {
            var file = await _dbContext.Files.FindAsync(fileId);
            if (file == null) throw new KeyNotFoundException("File not found.");
            await ValidateAccessAsync(userId, null, file, "Editor");

            var trimmedTag = tag.Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(trimmedTag)) return;

            var exists = await _dbContext.FileTags.AnyAsync(t => t.FileId == fileId && t.Tag == trimmedTag);
            if (exists) return;

            var fileTag = new FileTag { FileId = fileId, Tag = trimmedTag };
            _dbContext.FileTags.Add(fileTag);
            await _dbContext.SaveChangesAsync();

            await LogAuditAsync(userId, "PermissionChange", fileId, file.FolderId, null, new { Action = "AddTag", Tag = trimmedTag });
        }

        public async Task RemoveTagFromFileAsync(Guid userId, Guid fileId, string tag)
        {
            var file = await _dbContext.Files.FindAsync(fileId);
            if (file == null) throw new KeyNotFoundException("File not found.");
            await ValidateAccessAsync(userId, null, file, "Editor");

            var fileTag = await _dbContext.FileTags.FirstOrDefaultAsync(t => t.FileId == fileId && t.Tag == tag);
            if (fileTag == null) return;

            _dbContext.FileTags.Remove(fileTag);
            await _dbContext.SaveChangesAsync();

            await LogAuditAsync(userId, "PermissionChange", fileId, file.FolderId, null, new { Action = "RemoveTag", Tag = tag });
        }

        // ==========================================
        // QUOTA CALCULATIONS
        // ==========================================
        public async Task<(long UsedBytes, long LimitBytes)> GetUserQuotaAsync(Guid userId)
        {
            var user = await _dbContext.Users.Include(u => u.UserRoles).ThenInclude(ur => ur.Role).FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null) throw new ArgumentException("User not found.");

            var roleName = user.UserRoles.Select(ur => ur.Role.Name).FirstOrDefault() ?? "Guest";
            long limit = roleName switch
            {
                "Super Administrator" => -1, // Unlimited
                "Administrator" => -1,
                "Manager" => 100L * 1024 * 1024 * 1024, // 100 GB
                "Employee" => 25L * 1024 * 1024 * 1024, // 25 GB
                "Family Member" => 10L * 1024 * 1024 * 1024, // 10 GB
                _ => 1024 * 1024 * 1024 // 1 GB Guest
            };

            var used = await _dbContext.Files
                .Where(f => f.OwnerId == userId && !f.IsDeleted)
                .Join(_dbContext.FileVersions, f => f.CurrentVersionId, fv => fv.Id, (f, fv) => fv.FileSize)
                .SumAsync();

            return (used, limit);
        }

        public async Task<(long UsedBytes, long LimitBytes)> GetTeamQuotaAsync(Guid teamId)
        {
            long limit = 1024L * 1024 * 1024 * 1024; // 1 TB
            var used = await _dbContext.Files
                .Where(f => f.SpaceType == "Team" && f.SpaceTargetId == teamId && !f.IsDeleted)
                .Join(_dbContext.FileVersions, f => f.CurrentVersionId, fv => fv.Id, (f, fv) => fv.FileSize)
                .SumAsync();

            return (used, limit);
        }

        // ==========================================
        // HIERARCHY NAVIGATION BROWSER HELPERS
        // ==========================================
        public async Task<List<Folder>> GetSubFoldersAsync(Guid userId, Guid? parentId, string spaceType, Guid? spaceTargetId)
        {
            var query = _dbContext.Folders.Where(f => f.SpaceType == spaceType && !f.IsDeleted);

            if (spaceType == "Personal")
            {
                // Root personal folders are filtered by owner
                if (parentId == null)
                {
                    query = query.Where(f => f.ParentId == null && f.OwnerId == userId && f.Name != "Root");
                }
                else
                {
                    query = query.Where(f => f.ParentId == parentId);
                }
            }
            else
            {
                // Team/Family folders are filtered by target scope
                if (parentId == null)
                {
                    query = query.Where(f => f.SpaceTargetId == spaceTargetId && f.ParentId == null && f.Name != "Root");
                }
                else
                {
                    query = query.Where(f => f.SpaceTargetId == spaceTargetId && f.ParentId == parentId);
                }
            }

            var folders = await query.OrderBy(f => f.Name).ToListAsync();
            var authorizedFolders = new List<Folder>();

            foreach (var f in folders)
            {
                var level = await GetUserPermissionLevelAsync(userId, f, null);
                if (level != "None")
                {
                    authorizedFolders.Add(f);
                }
            }

            return authorizedFolders;
        }

        public async Task<List<FileMetadata>> GetFilesAsync(Guid userId, Guid? folderId, string spaceType, Guid? spaceTargetId)
        {
            var query = _dbContext.Files.Include(f => f.Versions).Include(f => f.Tags).Where(f => !f.IsDeleted);

            Guid? targetFolderId = folderId;
            if (!targetFolderId.HasValue)
            {
                Folder? rootFolder = null;
                if (spaceType == "Personal")
                {
                    rootFolder = await _dbContext.Folders.FirstOrDefaultAsync(f => f.SpaceType == "Personal" && f.OwnerId == userId && f.ParentId == null && f.Name == "Root" && !f.IsDeleted);
                }
                else if (spaceType == "Team")
                {
                    rootFolder = await _dbContext.Folders.FirstOrDefaultAsync(f => f.SpaceType == "Team" && f.SpaceTargetId == spaceTargetId && f.ParentId == null && f.Name == "Root" && !f.IsDeleted);
                }

                if (rootFolder != null)
                {
                    targetFolderId = rootFolder.Id;
                }
            }

            if (targetFolderId.HasValue)
            {
                query = query.Where(f => f.FolderId == targetFolderId.Value);
            }
            else
            {
                // Fallback
                query = query.Where(f => f.SpaceType == spaceType);
                if (spaceType == "Personal")
                {
                    query = query.Where(f => f.OwnerId == userId);
                }
                else
                {
                    query = query.Where(f => f.SpaceTargetId == spaceTargetId);
                }
            }

            var files = await query.OrderBy(f => f.Name).ToListAsync();
            var authorizedFiles = new List<FileMetadata>();

            foreach (var f in files)
            {
                var level = await GetUserPermissionLevelAsync(userId, null, f);
                if (level != "None")
                {
                    authorizedFiles.Add(f);
                }
            }

            return authorizedFiles;
        }
    }
}
