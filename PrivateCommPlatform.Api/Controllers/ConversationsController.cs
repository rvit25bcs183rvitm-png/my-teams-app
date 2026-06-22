using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PrivateCommPlatform.Api.Data;
using PrivateCommPlatform.Api.Models.Entities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class ConversationsController : ControllerBase
    {
        private readonly ApplicationDbContext _dbContext;

        public ConversationsController(ApplicationDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        public class CreateConversationRequest
        {
            public string Type { get; set; } = "DirectMessage"; // DirectMessage, GroupChat, Channel
            public string? Name { get; set; }
            public List<Guid> MemberIds { get; set; } = new();
            public Guid? ParentId { get; set; }
        }

        public class AddMemberRequest
        {
            public Guid UserId { get; set; }
            public string Role { get; set; } = "Employee"; // Owner, Manager, Employee, Guest
        }

        [HttpPost]
        public async Task<IActionResult> CreateConversation([FromBody] CreateConversationRequest request)
        {
            var currentUserId = GetCurrentUserId();

            if (request.Type != "DirectMessage" && request.Type != "GroupChat" && request.Type != "Channel")
            {
                return BadRequest(new { Error = "Invalid conversation type. Must be 'DirectMessage', 'GroupChat', or 'Channel'." });
            }

            if (request.Type == "DirectMessage")
            {
                if (request.MemberIds.Count != 1)
                {
                    return BadRequest(new { Error = "Direct message must include exactly one recipient." });
                }

                var targetUserId = request.MemberIds[0];
                if (targetUserId == currentUserId)
                {
                    return BadRequest(new { Error = "Cannot create a direct message with yourself." });
                }

                // Check if target user exists
                var targetExists = await _dbContext.Users.AnyAsync(u => u.Id == targetUserId);
                if (!targetExists)
                {
                    return NotFound(new { Error = "Recipient user not found." });
                }

                // Check for existing DM between these two users
                var existingDm = await _dbContext.Conversations
                    .Where(c => c.Type == "DirectMessage")
                    .FirstOrDefaultAsync(c => c.Members.Any(m => m.UserId == currentUserId) && c.Members.Any(m => m.UserId == targetUserId));

                if (existingDm != null)
                {
                    return Ok(existingDm);
                }
            }
            else
            {
                if (string.IsNullOrWhiteSpace(request.Name))
                {
                    return BadRequest(new { Error = "Name is required for Group Chat and Channel." });
                }
            }

            var conversation = new Conversation
            {
                Id = Guid.NewGuid(),
                Type = request.Type,
                Name = request.Type == "DirectMessage" ? null : request.Name,
                CreatedById = currentUserId,
                CreatedDate = DateTimeOffset.UtcNow,
                IsArchived = false,
                ParentId = request.ParentId
            };

            _dbContext.Conversations.Add(conversation);

            ConversationSetting? parentSettings = null;
            bool inheritedAnyMembers = false;

            if (request.ParentId.HasValue)
            {
                var parent = await _dbContext.Conversations
                    .Include(c => c.Members)
                    .Include(c => c.Settings)
                    .FirstOrDefaultAsync(c => c.Id == request.ParentId.Value);

                if (parent != null)
                {
                    parentSettings = parent.Settings;

                    // Inherit all members from parent
                    foreach (var parentMember in parent.Members)
                    {
                        _dbContext.ConversationMembers.Add(new ConversationMember
                        {
                            ConversationId = conversation.Id,
                            UserId = parentMember.UserId,
                            Role = parentMember.Role,
                            JoinedDate = DateTimeOffset.UtcNow
                        });
                    }
                    inheritedAnyMembers = parent.Members.Any();
                }
            }

            if (!inheritedAnyMembers)
            {
                // Add creator as member (Owner role)
                _dbContext.ConversationMembers.Add(new ConversationMember
                {
                    ConversationId = conversation.Id,
                    UserId = currentUserId,
                    Role = "Owner",
                    JoinedDate = DateTimeOffset.UtcNow
                });

                // Add other members
                var distinctMemberIds = request.MemberIds.Distinct().Where(id => id != currentUserId);
                foreach (var memberId in distinctMemberIds)
                {
                    var userExists = await _dbContext.Users.AnyAsync(u => u.Id == memberId);
                    if (!userExists)
                    {
                        return BadRequest(new { Error = $"User with ID {memberId} does not exist." });
                    }

                    _dbContext.ConversationMembers.Add(new ConversationMember
                    {
                        ConversationId = conversation.Id,
                        UserId = memberId,
                        Role = "Employee", // Default to Employee role
                        JoinedDate = DateTimeOffset.UtcNow
                    });
                }
            }

            // Create Conversation Settings
            if (conversation.Type != "DirectMessage")
            {
                var settings = new ConversationSetting
                {
                    ConversationId = conversation.Id,
                    PostingRestriction = parentSettings?.PostingRestriction ?? "AnyMember",
                    MemberAdditionRestriction = parentSettings?.MemberAdditionRestriction ?? "AnyMember",
                    DeleteRestriction = parentSettings?.DeleteRestriction ?? "OwnOrHigher",
                    EditRestriction = parentSettings?.EditRestriction ?? "OnlyOwnersAndManagers"
                };
                _dbContext.ConversationSettings.Add(settings);
            }

            await _dbContext.SaveChangesAsync();

            // Load members relation for response
            var createdConv = await _dbContext.Conversations
                .Include(c => c.Members)
                .ThenInclude(m => m.User)
                .Include(c => c.Settings)
                .FirstOrDefaultAsync(c => c.Id == conversation.Id);

            return CreatedAtAction(nameof(GetConversation), new { id = conversation.Id }, createdConv);
        }

        [HttpGet]
        public async Task<IActionResult> GetConversations()
        {
            var currentUserId = GetCurrentUserId();

            var conversations = await _dbContext.Conversations
                .Include(c => c.Members)
                .ThenInclude(m => m.User)
                .Include(c => c.Settings)
                .Where(c => c.Members.Any(m => m.UserId == currentUserId))
                .OrderByDescending(c => c.CreatedDate)
                .ToListAsync();

            return Ok(conversations);
        }

        /// <summary>GET /api/conversations/{id}/messages — fetch message history for a conversation</summary>
        [HttpGet("{id}/messages")]
        public async Task<IActionResult> GetMessages(Guid id, [FromQuery] int take = 100, [FromQuery] int skip = 0)
        {
            var currentUserId = GetCurrentUserId();

            // Verify the user is a member of this conversation
            var isMember = await _dbContext.ConversationMembers
                .AnyAsync(m => m.ConversationId == id && m.UserId == currentUserId);

            if (!isMember)
            {
                return Forbid();
            }

            // Get messages that haven't been self-deleted by this user
            var messages = await _dbContext.Messages
                .Include(m => m.Sender)
                .Include(m => m.Attachments)
                .Where(m => m.ConversationId == id)
                .Where(m => !_dbContext.MessageDeletes.Any(d => d.MessageId == m.Id && d.DeletedById == currentUserId && d.DeleteType == "Self"))
                .OrderBy(m => m.CreatedDate)
                .Skip(skip)
                .Take(take)
                .Select(m => new
                {
                    m.Id,
                    m.ConversationId,
                    m.SenderId,
                    SenderDisplayName = m.Sender.DisplayName,
                    m.Type,
                    m.Content,
                    m.CreatedDate,
                    m.ParentMessageId,
                    m.ForwardedFromMessageId,
                    m.IsEdited,
                    m.IsDeleted,
                    Attachments = m.Attachments.Select(a => new
                    {
                        a.Id,
                        a.FileName,
                        a.FileType,
                        a.FileSize
                    })
                })
                .ToListAsync();

            return Ok(messages);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetConversation(Guid id)
        {
            var currentUserId = GetCurrentUserId();

            var conversation = await _dbContext.Conversations
                .Include(c => c.Members)
                .ThenInclude(m => m.User)
                .Include(c => c.Settings)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (conversation == null)
            {
                return NotFound();
            }

            var isMember = conversation.Members.Any(m => m.UserId == currentUserId);
            if (!isMember)
            {
                return Forbid();
            }

            return Ok(conversation);
        }

        [HttpPost("{id}/members")]
        public async Task<IActionResult> AddMember(Guid id, [FromBody] AddMemberRequest request)
        {
            var currentUserId = GetCurrentUserId();

            var conversation = await _dbContext.Conversations
                .Include(c => c.Members)
                .Include(c => c.Settings)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (conversation == null)
            {
                return NotFound(new { Error = "Conversation not found." });
            }

            if (conversation.Type == "DirectMessage")
            {
                return BadRequest(new { Error = "Cannot add members to a Direct Message conversation." });
            }

            var callerMember = conversation.Members.FirstOrDefault(m => m.UserId == currentUserId);
            if (callerMember == null)
            {
                return Forbid();
            }

            // Check MemberAdditionRestriction
            var additionRestriction = conversation.Settings?.MemberAdditionRestriction ?? "AnyMember";
            bool isAllowed = false;

            if (callerMember.Role == "Owner")
            {
                isAllowed = true;
            }
            else if (callerMember.Role == "Manager")
            {
                isAllowed = additionRestriction != "OnlyOwners";
            }
            else if (callerMember.Role == "Employee")
            {
                isAllowed = additionRestriction == "AnyMember";
            }

            if (!isAllowed)
            {
                return Forbid();
            }

            // Verify member doesn't already exist
            var targetMember = conversation.Members.FirstOrDefault(m => m.UserId == request.UserId);
            if (targetMember != null)
            {
                return BadRequest(new { Error = "User is already a member of this conversation." });
            }

            // Verify user exists
            var userExists = await _dbContext.Users.AnyAsync(u => u.Id == request.UserId);
            if (!userExists)
            {
                return BadRequest(new { Error = "User does not exist." });
            }

            string targetRole = request.Role;
            // Employees/Guests cannot specify roles other than default Employee
            if (callerMember.Role != "Owner" && callerMember.Role != "Manager")
            {
                targetRole = "Employee";
            }

            // Only Owner can assign Owner role
            if (targetRole == "Owner" && callerMember.Role != "Owner")
            {
                return BadRequest(new { Error = "Only the Owner can assign the Owner role." });
            }

            var newMember = new ConversationMember
            {
                ConversationId = id,
                UserId = request.UserId,
                Role = targetRole,
                JoinedDate = DateTimeOffset.UtcNow
            };

            _dbContext.ConversationMembers.Add(newMember);

            // Audit Log
            _dbContext.GroupAuditLogs.Add(new GroupAuditLog
            {
                ConversationId = id,
                ActorId = currentUserId,
                EventType = "MemberAdded",
                Details = $"User {request.UserId} added with role {targetRole}."
            });

            await _dbContext.SaveChangesAsync();

            return Ok(new { Message = "Member added successfully." });
        }

        [HttpDelete("{id}/members/{userId}")]
        public async Task<IActionResult> RemoveMember(Guid id, Guid userId)
        {
            var currentUserId = GetCurrentUserId();

            var conversation = await _dbContext.Conversations
                .Include(c => c.Members)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (conversation == null)
            {
                return NotFound(new { Error = "Conversation not found." });
            }

            if (conversation.Type == "DirectMessage")
            {
                return BadRequest(new { Error = "Cannot remove members from a Direct Message conversation." });
            }

            // Verify target user is in conversation
            var targetMember = conversation.Members.FirstOrDefault(m => m.UserId == userId);
            if (targetMember == null)
            {
                return NotFound(new { Error = "User is not a member of this conversation." });
            }

            var callerMember = conversation.Members.FirstOrDefault(m => m.UserId == currentUserId);
            if (callerMember == null)
            {
                return Forbid();
            }

            bool isSelfLeaving = currentUserId == userId;
            bool isAuthorizedToRemove = callerMember.Role == "Owner" || callerMember.Role == "Manager";

            if (!isSelfLeaving && !isAuthorizedToRemove)
            {
                return Forbid();
            }

            // Under no circumstances can a Manager or any other user remove the Owner
            if (targetMember.Role == "Owner" && !isSelfLeaving)
            {
                return BadRequest(new { Error = "Under no circumstances can a Manager or any other user modify, demote, or remove a user with the Owner role." });
            }

            _dbContext.ConversationMembers.Remove(targetMember);

            // Audit Log
            _dbContext.GroupAuditLogs.Add(new GroupAuditLog
            {
                ConversationId = id,
                ActorId = currentUserId,
                EventType = "MemberRemoved",
                Details = isSelfLeaving ? $"User {userId} left the conversation." : $"User {userId} removed by user {currentUserId}."
            });

            await _dbContext.SaveChangesAsync();

            return Ok(new { Message = "Member removed successfully." });
        }

        [HttpPost("{id}/archive")]
        public async Task<IActionResult> ArchiveConversation(Guid id)
        {
            var currentUserId = GetCurrentUserId();

            var conversation = await _dbContext.Conversations
                .Include(c => c.Members)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (conversation == null)
            {
                return NotFound();
            }

            var callerMember = conversation.Members.FirstOrDefault(m => m.UserId == currentUserId);
            if (callerMember == null || (conversation.Type != "DirectMessage" && callerMember.Role != "Owner" && callerMember.Role != "Admin"))
            {
                return Forbid();
            }

            conversation.IsArchived = true;
            conversation.ArchivedDate = DateTimeOffset.UtcNow;

            await _dbContext.SaveChangesAsync();

            return Ok(new { Message = "Conversation archived successfully." });
        }

        [HttpPost("{id}/unarchive")]
        public async Task<IActionResult> UnarchiveConversation(Guid id)
        {
            var currentUserId = GetCurrentUserId();

            var conversation = await _dbContext.Conversations
                .Include(c => c.Members)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (conversation == null)
            {
                return NotFound();
            }

            var callerMember = conversation.Members.FirstOrDefault(m => m.UserId == currentUserId);
            if (callerMember == null || (conversation.Type != "DirectMessage" && callerMember.Role != "Owner" && callerMember.Role != "Admin"))
            {
                return Forbid();
            }

            conversation.IsArchived = false;
            conversation.ArchivedDate = null;

            await _dbContext.SaveChangesAsync();

            return Ok(new { Message = "Conversation unarchived successfully." });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteConversation(Guid id)
        {
            var currentUserId = GetCurrentUserId();

            var conversation = await _dbContext.Conversations
                .FirstOrDefaultAsync(c => c.Id == id);

            if (conversation == null)
            {
                return NotFound();
            }

            var isCreator = conversation.CreatedById == currentUserId;
            var isAdmin = User.IsInRole("Super Administrator") || User.IsInRole("Administrator");

            if (!isCreator && !isAdmin)
            {
                return Forbid();
            }

            _dbContext.Conversations.Remove(conversation);
            await _dbContext.SaveChangesAsync();

            return NoContent();
        }

        public class UpdateRoleRequest
        {
            public string Role { get; set; } = null!;
        }

        public class UpdateSettingsRequest
        {
            public string PostingRestriction { get; set; } = null!;
            public string MemberAdditionRestriction { get; set; } = null!;
            public string DeleteRestriction { get; set; } = null!;
            public string EditRestriction { get; set; } = null!;
        }

        [HttpPut("{id}/members/{userId}/role")]
        public async Task<IActionResult> UpdateRole(Guid id, Guid userId, [FromBody] UpdateRoleRequest request)
        {
            var currentUserId = GetCurrentUserId();
            var allowedRoles = new[] { "Owner", "Manager", "Employee", "Guest" };

            if (!allowedRoles.Contains(request.Role))
            {
                return BadRequest(new { Error = $"Invalid role. Allowed roles are: {string.Join(", ", allowedRoles)}." });
            }

            var conversation = await _dbContext.Conversations
                .Include(c => c.Members)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (conversation == null)
            {
                return NotFound(new { Error = "Conversation not found." });
            }

            var callerMember = conversation.Members.FirstOrDefault(m => m.UserId == currentUserId);
            if (callerMember == null)
            {
                return Forbid();
            }

            var targetMember = conversation.Members.FirstOrDefault(m => m.UserId == userId);
            if (targetMember == null)
            {
                return NotFound(new { Error = "Target user is not a member of this conversation." });
            }

            // Only Owner and Manager can change roles
            if (callerMember.Role != "Owner" && callerMember.Role != "Manager")
            {
                return Forbid();
            }

            // Manager restrictions
            if (callerMember.Role == "Manager")
            {
                // Manager cannot demote or modify Owner
                if (targetMember.Role == "Owner")
                {
                    return BadRequest(new { Error = "Under no circumstances can a Manager or any other user modify, demote, or remove a user with the Owner role." });
                }

                // Manager cannot promote someone to Owner
                if (request.Role == "Owner")
                {
                    return BadRequest(new { Error = "Only the Owner can assign the Owner role." });
                }
            }

            // If Owner is demoting themselves, ensure there is at least one other member? (Not strictly enforced, but let's log it)
            string oldRole = targetMember.Role;
            targetMember.Role = request.Role;

            // Audit Log
            _dbContext.GroupAuditLogs.Add(new GroupAuditLog
            {
                ConversationId = id,
                ActorId = currentUserId,
                EventType = "RoleChanged",
                Details = $"User {userId} role changed from {oldRole} to {request.Role} by user {currentUserId}."
            });

            await _dbContext.SaveChangesAsync();

            return Ok(new { Message = "Role updated successfully." });
        }

        [HttpGet("{id}/settings")]
        public async Task<IActionResult> GetSettings(Guid id)
        {
            var currentUserId = GetCurrentUserId();

            var conversation = await _dbContext.Conversations
                .Include(c => c.Members)
                .Include(c => c.Settings)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (conversation == null)
            {
                return NotFound();
            }

            var isMember = conversation.Members.Any(m => m.UserId == currentUserId);
            if (!isMember)
            {
                return Forbid();
            }

            if (conversation.Settings == null)
            {
                // Auto-create settings if missing
                var settings = new ConversationSetting
                {
                    ConversationId = id
                };
                _dbContext.ConversationSettings.Add(settings);
                await _dbContext.SaveChangesAsync();
                return Ok(settings);
            }

            return Ok(conversation.Settings);
        }

        [HttpPut("{id}/settings")]
        public async Task<IActionResult> UpdateSettings(Guid id, [FromBody] UpdateSettingsRequest request)
        {
            var currentUserId = GetCurrentUserId();

            var conversation = await _dbContext.Conversations
                .Include(c => c.Members)
                .Include(c => c.Settings)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (conversation == null)
            {
                return NotFound();
            }

            var callerMember = conversation.Members.FirstOrDefault(m => m.UserId == currentUserId);
            if (callerMember == null || (callerMember.Role != "Owner" && callerMember.Role != "Manager"))
            {
                return Forbid();
            }

            // Validate values
            var validPosting = new[] { "AnyMember", "OnlyOwnersAndManagers", "OnlyOwners" };
            var validAddition = new[] { "AnyMember", "OnlyOwnersAndManagers", "OnlyOwners" };
            var validDelete = new[] { "OwnOrHigher", "OnlyOwnersAndManagers" };
            var validEdit = new[] { "OnlyOwnersAndManagers", "OnlyOwners" };

            if (!validPosting.Contains(request.PostingRestriction) ||
                !validAddition.Contains(request.MemberAdditionRestriction) ||
                !validDelete.Contains(request.DeleteRestriction) ||
                !validEdit.Contains(request.EditRestriction))
            {
                return BadRequest(new { Error = "One or more restriction values are invalid." });
            }

            var settings = conversation.Settings;
            if (settings == null)
            {
                settings = new ConversationSetting { ConversationId = id };
                _dbContext.ConversationSettings.Add(settings);
            }

            settings.PostingRestriction = request.PostingRestriction;
            settings.MemberAdditionRestriction = request.MemberAdditionRestriction;
            settings.DeleteRestriction = request.DeleteRestriction;
            settings.EditRestriction = request.EditRestriction;

            // Audit Log
            _dbContext.GroupAuditLogs.Add(new GroupAuditLog
            {
                ConversationId = id,
                ActorId = currentUserId,
                EventType = "SettingsChanged",
                Details = $"Settings updated: PostingRestriction={request.PostingRestriction}, MemberAdditionRestriction={request.MemberAdditionRestriction}, DeleteRestriction={request.DeleteRestriction}, EditRestriction={request.EditRestriction} by user {currentUserId}."
            });

            await _dbContext.SaveChangesAsync();

            return Ok(settings);
        }

        private Guid GetCurrentUserId()
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return Guid.TryParse(userId, out Guid id) ? id : Guid.Empty;
        }
    }
}
