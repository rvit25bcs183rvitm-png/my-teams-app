using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;
using PrivateCommPlatform.Api.Data;
using PrivateCommPlatform.Api.Hubs;
using PrivateCommPlatform.Api.Models.Entities;
using PrivateCommPlatform.Api.Services;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class MessagesController : ControllerBase
    {
        private readonly IMessageService _messageService;
        private readonly ISyncService _syncService;
        private readonly ApplicationDbContext _dbContext;

        public MessagesController(
            IMessageService messageService,
            ISyncService syncService,
            ApplicationDbContext dbContext)
        {
            _messageService = messageService;
            _syncService = syncService;
            _dbContext = dbContext;
        }

        public class SendMessageRequest
        {
            public Guid ConversationId { get; set; }
            public string Content { get; set; } = string.Empty;
            public string Type { get; set; } = "Text"; // Text, RichText, Attachment, System
            public Guid? ParentMessageId { get; set; }
            public Guid? ForwardedFromMessageId { get; set; }
        }

        public class EditMessageRequest
        {
            public string Content { get; set; } = string.Empty;
        }

        public class ReactionRequest
        {
            public string Emoji { get; set; } = string.Empty;
        }

        [HttpPost]
        public async Task<IActionResult> SendMessage([FromBody] SendMessageRequest request)
        {
            var currentUserId = GetCurrentUserId();

            try
            {
                var message = await _messageService.SendMessageAsync(
                    currentUserId,
                    request.ConversationId,
                    request.Content,
                    request.Type,
                    request.ParentMessageId,
                    request.ForwardedFromMessageId
                );

                return CreatedAtAction(nameof(GetMessage), new { id = message.Id }, message);
            }
            catch (UnauthorizedAccessException ex)
            {
                return Forbid(ex.Message);
            }
            catch (Exception ex)
            {
                return BadRequest(new { Error = ex.Message });
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetMessage(Guid id)
        {
            var currentUserId = GetCurrentUserId();

            var message = await _dbContext.Messages
                .Include(m => m.Sender)
                .Include(m => m.Attachments)
                .Include(m => m.Reactions)
                .FirstOrDefaultAsync(m => m.Id == id);

            if (message == null)
            {
                return NotFound();
            }

            var isMember = await _messageService.IsConversationMemberAsync(message.ConversationId, currentUserId);
            if (!isMember)
            {
                return Forbid();
            }

            // If message is deleted for Self by this user
            var isSelfDeleted = await _dbContext.MessageDeletes
                .AnyAsync(d => d.MessageId == id && d.DeletedById == currentUserId && d.DeleteType == "Self");

            if (isSelfDeleted)
            {
                return NotFound();
            }

            return Ok(message);
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> EditMessage(Guid id, [FromBody] EditMessageRequest request)
        {
            var currentUserId = GetCurrentUserId();

            if (string.IsNullOrWhiteSpace(request.Content))
            {
                return BadRequest(new { Error = "Content cannot be empty." });
            }

            try
            {
                var message = await _messageService.EditMessageAsync(currentUserId, id, request.Content);
                return Ok(message);
            }
            catch (UnauthorizedAccessException ex)
            {
                return Forbid(ex.Message);
            }
            catch (KeyNotFoundException)
            {
                return NotFound();
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { Error = ex.Message });
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteMessage(Guid id, [FromQuery] string deleteType = "Everyone")
        {
            var currentUserId = GetCurrentUserId();

            try
            {
                await _messageService.DeleteMessageAsync(currentUserId, id, deleteType);
                return NoContent();
            }
            catch (UnauthorizedAccessException ex)
            {
                return Forbid(ex.Message);
            }
            catch (KeyNotFoundException)
            {
                return NotFound();
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { Error = ex.Message });
            }
        }

        [HttpPost("{id}/react")]
        public async Task<IActionResult> AddReaction(Guid id, [FromBody] ReactionRequest request)
        {
            var currentUserId = GetCurrentUserId();

            try
            {
                await _messageService.AddReactionAsync(currentUserId, id, request.Emoji);
                return Ok(new { Message = "Reaction added." });
            }
            catch (UnauthorizedAccessException ex)
            {
                return Forbid(ex.Message);
            }
            catch (KeyNotFoundException)
            {
                return NotFound();
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { Error = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { Error = ex.Message });
            }
        }

        [HttpDelete("{id}/react")]
        public async Task<IActionResult> RemoveReaction(Guid id, [FromBody] ReactionRequest request)
        {
            var currentUserId = GetCurrentUserId();

            try
            {
                await _messageService.RemoveReactionAsync(currentUserId, id, request.Emoji);
                return Ok(new { Message = "Reaction removed." });
            }
            catch (KeyNotFoundException)
            {
                return NotFound();
            }
        }

        [HttpPost("{id}/deliver")]
        public async Task<IActionResult> MarkAsDelivered(Guid id)
        {
            var currentUserId = GetCurrentUserId();

            try
            {
                await _messageService.MarkAsDeliveredAsync(currentUserId, id);
                return Ok(new { Message = "Marked as delivered." });
            }
            catch (UnauthorizedAccessException ex)
            {
                return Forbid(ex.Message);
            }
            catch (KeyNotFoundException)
            {
                return NotFound();
            }
        }

        [HttpPost("{id}/read")]
        public async Task<IActionResult> MarkAsRead(Guid id)
        {
            var currentUserId = GetCurrentUserId();

            try
            {
                await _messageService.MarkAsReadAsync(currentUserId, id);
                return Ok(new { Message = "Marked as read." });
            }
            catch (UnauthorizedAccessException ex)
            {
                return Forbid(ex.Message);
            }
            catch (KeyNotFoundException)
            {
                return NotFound();
            }
        }

        [HttpGet("sync")]
        public async Task<IActionResult> Sync([FromQuery] string since)
        {
            var currentUserId = GetCurrentUserId();

            if (!DateTimeOffset.TryParse(since, out var sinceTime))
            {
                return BadRequest(new { Error = "Invalid ISO-8601 date format for 'since' parameter." });
            }

            var deltas = await _syncService.GetSyncDeltasAsync(currentUserId, sinceTime);
            return Ok(deltas);
        }

        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? keyword,
            [FromQuery] Guid? senderId,
            [FromQuery] Guid? conversationId,
            [FromQuery] DateTimeOffset? startDate,
            [FromQuery] DateTimeOffset? endDate,
            [FromQuery] string? fileType)
        {
            var currentUserId = GetCurrentUserId();

            // Core Security: Only search conversations where the user is a member
            var query = _dbContext.Messages
                .Include(m => m.Sender)
                .Include(m => m.Attachments)
                .Where(m => _dbContext.ConversationMembers.Any(mb => mb.ConversationId == m.ConversationId && mb.UserId == currentUserId));

            // Filter out self-deleted messages
            query = query.Where(m => !_dbContext.MessageDeletes.Any(d => d.MessageId == m.Id && d.DeletedById == currentUserId && d.DeleteType == "Self"));

            if (!string.IsNullOrWhiteSpace(keyword))
            {
                query = query.Where(m => m.Content.Contains(keyword));
            }

            if (senderId.HasValue)
            {
                query = query.Where(m => m.SenderId == senderId.Value);
            }

            if (conversationId.HasValue)
            {
                query = query.Where(m => m.ConversationId == conversationId.Value);
            }

            if (startDate.HasValue)
            {
                query = query.Where(m => m.CreatedDate >= startDate.Value);
            }

            if (endDate.HasValue)
            {
                query = query.Where(m => m.CreatedDate <= endDate.Value);
            }

            if (!string.IsNullOrWhiteSpace(fileType))
            {
                query = query.Where(m => m.Attachments.Any(a => a.FileType.Contains(fileType) || a.FileName.EndsWith(fileType)));
            }

            var results = await query
                .OrderByDescending(m => m.CreatedDate)
                .Take(100) // Limit search results count
                .ToListAsync();

            return Ok(results);
        }

        [HttpPost("upload")]
        public async Task<IActionResult> UploadAttachment([FromForm] IFormFile file, [FromForm] Guid conversationId)
        {
            var currentUserId = GetCurrentUserId();

            if (file == null || file.Length == 0)
            {
                return BadRequest(new { Error = "No file uploaded." });
            }

            // Verify conversation membership
            var isMember = await _messageService.IsConversationMemberAsync(conversationId, currentUserId);
            if (!isMember)
            {
                return Forbid("You are not a member of this conversation.");
            }

            // Scan for illegal file extensions
            var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
            var illegalExtensions = new[] { ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".vbs", ".js", ".sh", ".lnk" };
            if (illegalExtensions.Contains(fileExtension))
            {
                return BadRequest(new { Error = "File type upload is prohibited for security reasons." });
            }

            // Create private local storage folder if not exists
            var storageDirectory = Path.Combine(Directory.GetCurrentDirectory(), "PlatformStorage", "Attachments");
            if (!Directory.Exists(storageDirectory))
            {
                Directory.CreateDirectory(storageDirectory);
            }

            var fileId = Guid.NewGuid();
            var safeFileName = $"{fileId}{fileExtension}";
            var storagePath = Path.Combine(storageDirectory, safeFileName);

            // Save file physically
            using (var stream = new FileStream(storagePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            // Create Message + Attachment records
            var message = new Message
            {
                Id = Guid.NewGuid(),
                ConversationId = conversationId,
                SenderId = currentUserId,
                Type = "Attachment",
                Content = file.FileName,
                CreatedDate = DateTimeOffset.UtcNow
            };

            var attachment = new Attachment
            {
                Id = fileId,
                MessageId = message.Id,
                FileName = file.FileName,
                FileType = file.ContentType,
                FileSize = file.Length,
                StoragePath = storagePath,
                CreatedDate = DateTimeOffset.UtcNow
            };

            _dbContext.Messages.Add(message);
            _dbContext.Attachments.Add(attachment);

            await _dbContext.SaveChangesAsync();

            // Broadcast attachment message over SignalR
            await _dbContext.Entry(message).Reference(m => m.Sender).LoadAsync();
            await _dbContext.Entry(message).Collection(m => m.Attachments).LoadAsync();

            var hubContext = HttpContext.RequestServices.GetRequiredService<IHubContext<ChatHub>>();
            await hubContext.Clients.Group($"conversation:{conversationId}")
                .SendAsync("ReceiveMessage", new
                {
                    message.Id,
                    message.ConversationId,
                    message.SenderId,
                    SenderDisplayName = message.Sender.DisplayName,
                    message.Type,
                    message.Content,
                    message.CreatedDate,
                    message.ParentMessageId,
                    message.ForwardedFromMessageId,
                    message.IsEdited,
                    message.IsDeleted,
                    Attachments = message.Attachments.Select(a => new { a.Id, a.FileName, a.FileType, a.FileSize })
                });

            return Ok(attachment);
        }

        [HttpGet("attachments/{id}")]
        public async Task<IActionResult> DownloadAttachment(Guid id)
        {
            var currentUserId = GetCurrentUserId();

            var attachment = await _dbContext.Attachments
                .Include(a => a.Message)
                .FirstOrDefaultAsync(a => a.Id == id);

            if (attachment == null)
            {
                return NotFound();
            }

            // Verify membership for downloading
            var isMember = await _messageService.IsConversationMemberAsync(attachment.Message.ConversationId, currentUserId);
            if (!isMember)
            {
                return Forbid("You are not authorized to download this file.");
            }

            if (!System.IO.File.Exists(attachment.StoragePath))
            {
                return NotFound(new { Error = "Physical file has been deleted or moved." });
            }

            return PhysicalFile(attachment.StoragePath, attachment.FileType, attachment.FileName);
        }

        private Guid GetCurrentUserId()
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return Guid.TryParse(userId, out Guid id) ? id : Guid.Empty;
        }
    }
}
