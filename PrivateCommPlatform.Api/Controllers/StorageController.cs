using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using PrivateCommPlatform.Api.Services;
using System;
using System.IO;
using System.Security.Claims;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/storage")]
    public class StorageController : ControllerBase
    {
        private readonly IStorageService _storageService;

        public StorageController(IStorageService storageService)
        {
            _storageService = storageService;
        }

        // ─────────────────────────────────────────
        // HELPERS
        // ─────────────────────────────────────────
        private Guid GetCurrentUserId()
        {
            var value = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return Guid.TryParse(value, out var id) ? id : Guid.Empty;
        }

        // ─────────────────────────────────────────
        // FOLDER ENDPOINTS
        // ─────────────────────────────────────────

        /// <summary>GET /api/storage/folders  — list subfolders of the requested parent / space</summary>
        [HttpGet("folders")]
        public async Task<IActionResult> GetFolders(
            [FromQuery] Guid? parentId,
            [FromQuery] string spaceType = "Personal",
            [FromQuery] Guid? spaceTargetId = null)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            var folders = await _storageService.GetSubFoldersAsync(userId, parentId, spaceType, spaceTargetId);
            return Ok(folders);
        }

        public class CreateFolderRequest
        {
            public string Name { get; set; } = string.Empty;
            public Guid? ParentId { get; set; }
            public string SpaceType { get; set; } = "Personal";
            public Guid? SpaceTargetId { get; set; }
        }

        /// <summary>POST /api/storage/folders  — create a new folder</summary>
        [HttpPost("folders")]
        public async Task<IActionResult> CreateFolder([FromBody] CreateFolderRequest req)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            if (string.IsNullOrWhiteSpace(req.Name))
                return BadRequest(new { error = "Folder name is required." });

            var folder = await _storageService.CreateFolderAsync(userId, req.Name.Trim(), req.ParentId, req.SpaceType, req.SpaceTargetId);
            return Ok(folder);
        }

        public class RenameFolderRequest { public string NewName { get; set; } = string.Empty; }

        /// <summary>PUT /api/storage/folders/{id}/rename</summary>
        [HttpPut("folders/{id}/rename")]
        public async Task<IActionResult> RenameFolder(Guid id, [FromBody] RenameFolderRequest req)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            if (string.IsNullOrWhiteSpace(req.NewName))
                return BadRequest(new { error = "New name is required." });

            var folder = await _storageService.RenameFolderAsync(userId, id, req.NewName.Trim());
            return Ok(folder);
        }

        public class MoveFolderRequest { public Guid? TargetFolderId { get; set; } }

        /// <summary>PUT /api/storage/folders/{id}/move</summary>
        [HttpPut("folders/{id}/move")]
        public async Task<IActionResult> MoveFolder(Guid id, [FromBody] MoveFolderRequest req)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            var folder = await _storageService.MoveFolderAsync(userId, id, req.TargetFolderId);
            return Ok(folder);
        }

        /// <summary>DELETE /api/storage/folders/{id}  — soft-delete folder + all contents</summary>
        [HttpDelete("folders/{id}")]
        public async Task<IActionResult> DeleteFolder(Guid id)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            await _storageService.DeleteFolderAsync(userId, id);
            return Ok(new { success = true, message = "Folder moved to trash." });
        }

        /// <summary>POST /api/storage/folders/{id}/restore</summary>
        [HttpPost("folders/{id}/restore")]
        public async Task<IActionResult> RestoreFolder(Guid id)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            await _storageService.RestoreFolderAsync(userId, id);
            return Ok(new { success = true, message = "Folder restored." });
        }

        // ─────────────────────────────────────────
        // FILE LIST ENDPOINT
        // ─────────────────────────────────────────

        /// <summary>GET /api/storage/files  — list files in a folder / space root</summary>
        [HttpGet("files")]
        public async Task<IActionResult> GetFiles(
            [FromQuery] Guid? folderId,
            [FromQuery] string spaceType = "Personal",
            [FromQuery] Guid? spaceTargetId = null)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            var files = await _storageService.GetFilesAsync(userId, folderId, spaceType, spaceTargetId);
            return Ok(files);
        }

        // ─────────────────────────────────────────
        // UPLOAD ENDPOINTS
        // ─────────────────────────────────────────

        /// <summary>POST /api/storage/files/upload  — upload a new file</summary>
        [HttpPost("files/upload")]
        [RequestSizeLimit(500 * 1024 * 1024)] // 500 MB hard cap
        public async Task<IActionResult> UploadFile(
            IFormFile file,
            [FromForm] Guid? folderId,
            [FromForm] string spaceType = "Personal",
            [FromForm] Guid? spaceTargetId = null)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            if (file == null || file.Length == 0)
                return BadRequest(new { error = "No file provided." });

            await using var stream = file.OpenReadStream();
            var metadata = await _storageService.UploadFileAsync(
                userId,
                file.FileName,
                file.ContentType,
                file.Length,
                stream,
                folderId,
                spaceType,
                spaceTargetId);

            return Ok(metadata);
        }

        /// <summary>POST /api/storage/files/{id}/version  — upload new version of an existing file</summary>
        [HttpPost("files/{id}/version")]
        [RequestSizeLimit(500 * 1024 * 1024)]
        public async Task<IActionResult> UploadFileVersion(Guid id, IFormFile file)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            if (file == null || file.Length == 0)
                return BadRequest(new { error = "No file provided." });

            await using var stream = file.OpenReadStream();
            var metadata = await _storageService.UploadFileVersionAsync(userId, id, file.ContentType, file.Length, stream);
            return Ok(metadata);
        }

        // ─────────────────────────────────────────
        // DOWNLOAD ENDPOINT
        // ─────────────────────────────────────────

        /// <summary>GET /api/storage/files/{id}/download  — authenticated download (optionally a specific version)</summary>
        [HttpGet("files/{id}/download")]
        public async Task<IActionResult> DownloadFile(Guid id, [FromQuery] int? version)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            var (fileVersion, physicalPath) = await _storageService.DownloadFileAsync(userId, id, version);

            if (!System.IO.File.Exists(physicalPath))
                return NotFound(new { error = "Physical file not found on storage." });

            var fileStream = System.IO.File.OpenRead(physicalPath);
            return File(fileStream, fileVersion.MimeType ?? "application/octet-stream", Path.GetFileName(physicalPath));
        }

        // ─────────────────────────────────────────
        // PREVIEW ENDPOINTS
        // ─────────────────────────────────────────

        /// <summary>GET /api/storage/files/{id}/preview-token  — generate a 5-min preview token</summary>
        [HttpGet("files/{id}/preview-token")]
        public async Task<IActionResult> GetPreviewToken(Guid id)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            var token = await _storageService.GeneratePreviewTokenAsync(userId, id);
            return Ok(new { token });
        }

        /// <summary>GET /api/storage/preview  — anonymous (token-based) file preview fetch [AllowAnonymous]</summary>
        [AllowAnonymous]
        [HttpGet("preview")]
        public async Task<IActionResult> PreviewByToken([FromQuery] string token)
        {
            if (string.IsNullOrWhiteSpace(token))
                return BadRequest(new { error = "Token required." });

            var (fileVersion, physicalPath) = await _storageService.GetPreviewFileByTokenAsync(token);

            if (!System.IO.File.Exists(physicalPath))
                return NotFound(new { error = "Preview file not found." });

            var fileStream = System.IO.File.OpenRead(physicalPath);
            return File(fileStream, fileVersion.MimeType ?? "application/octet-stream");
        }

        // ─────────────────────────────────────────
        // FILE RENAME / MOVE / DELETE / RESTORE
        // ─────────────────────────────────────────

        public class RenameFileRequest { public string NewName { get; set; } = string.Empty; }

        /// <summary>PUT /api/storage/files/{id}/rename</summary>
        [HttpPut("files/{id}/rename")]
        public async Task<IActionResult> RenameFile(Guid id, [FromBody] RenameFileRequest req)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            if (string.IsNullOrWhiteSpace(req.NewName))
                return BadRequest(new { error = "New name is required." });

            var file = await _storageService.RenameFileAsync(userId, id, req.NewName.Trim());
            return Ok(file);
        }

        public class MoveFileRequest { public Guid TargetFolderId { get; set; } }

        /// <summary>PUT /api/storage/files/{id}/move</summary>
        [HttpPut("files/{id}/move")]
        public async Task<IActionResult> MoveFile(Guid id, [FromBody] MoveFileRequest req)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            var file = await _storageService.MoveFileAsync(userId, id, req.TargetFolderId);
            return Ok(file);
        }

        /// <summary>DELETE /api/storage/files/{id}  — soft-delete a file</summary>
        [HttpDelete("files/{id}")]
        public async Task<IActionResult> DeleteFile(Guid id)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            await _storageService.DeleteFileAsync(userId, id);
            return Ok(new { success = true, message = "File moved to trash." });
        }

        /// <summary>POST /api/storage/files/{id}/restore</summary>
        [HttpPost("files/{id}/restore")]
        public async Task<IActionResult> RestoreFile(Guid id)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            await _storageService.RestoreFileAsync(userId, id);
            return Ok(new { success = true, message = "File restored." });
        }

        // ─────────────────────────────────────────
        // VERSION HISTORY
        // ─────────────────────────────────────────

        /// <summary>GET /api/storage/files/{id}/versions</summary>
        [HttpGet("files/{id}/versions")]
        public async Task<IActionResult> GetVersions(Guid id)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            var versions = await _storageService.GetFileVersionsAsync(userId, id);
            return Ok(versions);
        }

        public class RestoreVersionRequest { public int VersionNumber { get; set; } }

        /// <summary>POST /api/storage/files/{id}/versions/restore</summary>
        [HttpPost("files/{id}/versions/restore")]
        public async Task<IActionResult> RestoreVersion(Guid id, [FromBody] RestoreVersionRequest req)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            await _storageService.RestoreFileVersionAsync(userId, id, req.VersionNumber);
            return Ok(new { success = true, message = $"Restored to version {req.VersionNumber}." });
        }

        // ─────────────────────────────────────────
        // SHARING
        // ─────────────────────────────────────────

        public class ShareRequest
        {
            public string RecipientType { get; set; } = "User"; // User | Team
            public Guid RecipientId { get; set; }
            public Guid? FileId { get; set; }
            public Guid? FolderId { get; set; }
            public string PermissionLevel { get; set; } = "Viewer"; // Viewer | Editor | Owner
            public int? ExpiresInDays { get; set; }
        }

        /// <summary>POST /api/storage/shares</summary>
        [HttpPost("shares")]
        public async Task<IActionResult> ShareItem([FromBody] ShareRequest req)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            await _storageService.ShareFileOrFolderAsync(
                userId, req.RecipientType, req.RecipientId,
                req.FileId, req.FolderId, req.PermissionLevel, req.ExpiresInDays);

            return Ok(new { success = true, message = "Shared successfully." });
        }

        // ─────────────────────────────────────────
        // SEARCH
        // ─────────────────────────────────────────

        /// <summary>GET /api/storage/search?q=report&tag=finance</summary>
        [HttpGet("search")]
        public async Task<IActionResult> Search([FromQuery] string q = "", [FromQuery] string? tag = null)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();

            var files = await _storageService.SearchFilesAsync(userId, q, tag);
            return Ok(files);
        }

        // ─────────────────────────────────────────
        // TAGS
        // ─────────────────────────────────────────

        public class TagRequest { public string Tag { get; set; } = string.Empty; }

        [HttpPost("files/{id}/tags")]
        public async Task<IActionResult> AddTag(Guid id, [FromBody] TagRequest req)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();
            await _storageService.AddTagToFileAsync(userId, id, req.Tag);
            return Ok(new { success = true });
        }

        [HttpDelete("files/{id}/tags/{tag}")]
        public async Task<IActionResult> RemoveTag(Guid id, string tag)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();
            await _storageService.RemoveTagFromFileAsync(userId, id, tag);
            return Ok(new { success = true });
        }

        // ─────────────────────────────────────────
        // QUOTAS
        // ─────────────────────────────────────────

        [HttpGet("quotas/user")]
        public async Task<IActionResult> GetUserQuota()
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();
            var (used, limit) = await _storageService.GetUserQuotaAsync(userId);
            return Ok(new { usedBytes = used, limitBytes = limit, usedMb = Math.Round(used / 1048576.0, 2), limitMb = limit == -1 ? -1 : Math.Round(limit / 1048576.0, 2) });
        }

        [HttpGet("quotas/team/{teamId}")]
        public async Task<IActionResult> GetTeamQuota(Guid teamId)
        {
            var userId = GetCurrentUserId();
            if (userId == Guid.Empty) return Unauthorized();
            var (used, limit) = await _storageService.GetTeamQuotaAsync(teamId);
            return Ok(new { usedBytes = used, limitBytes = limit, usedMb = Math.Round(used / 1048576.0, 2), limitMb = Math.Round(limit / 1048576.0, 2) });
        }
    }
}
