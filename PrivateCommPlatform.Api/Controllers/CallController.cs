using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using PrivateCommPlatform.Api.Data;
using PrivateCommPlatform.Api.Models.Entities;
using PrivateCommPlatform.Api.Services;
using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class CallController : ControllerBase
    {
        private readonly ApplicationDbContext _dbContext;
        private readonly ICallService _callService;
        private readonly IConfiguration _configuration;
        private readonly ITurnCredentialService _turnCredentialService;

        public CallController(ApplicationDbContext dbContext, ICallService callService, IConfiguration configuration, ITurnCredentialService turnCredentialService)
        {
            _dbContext = dbContext;
            _callService = callService;
            _configuration = configuration;
            _turnCredentialService = turnCredentialService;
        }

        [HttpGet("history")]
        public async Task<IActionResult> GetCallHistory()
        {
            var userId = GetCurrentUserId();
            var calls = await _dbContext.Calls
                .Include(c => c.Caller)
                .Include(c => c.Participants)
                    .ThenInclude(p => p.User)
                .Where(c => c.CallerId == userId || c.Participants.Any(p => p.UserId == userId))
                .OrderByDescending(c => c.StartTime)
                .Select(c => new
                {
                    c.Id,
                    c.CallerId,
                    CallerName = c.Caller.DisplayName,
                    c.StartTime,
                    c.EndTime,
                    c.Duration,
                    c.Status,
                    c.Type,
                    c.UserRating,
                    c.UserFeedback,
                    Participants = c.Participants.Select(p => p.User.DisplayName).ToList()
                })
                .ToListAsync();

            return Ok(calls);
        }

        [HttpPost("{callId}/rate")]
        public async Task<IActionResult> RateCall(Guid callId, [FromBody] RatingRequest request)
        {
            var userId = GetCurrentUserId();
            await _callService.SaveCallRatingAsync(callId, userId, request.Rating, request.Feedback);
            return Ok(new { Message = "Call rating saved." });
        }

        [HttpPost("blocks")]
        public async Task<IActionResult> BlockUser([FromBody] BlockRequest request)
        {
            var userId = GetCurrentUserId();
            var blockExists = await _dbContext.UserBlocks.AnyAsync(b => b.BlockerId == userId && b.BlockedId == request.TargetUserId);
            if (blockExists) return BadRequest(new { Error = "User already blocked." });

            _dbContext.UserBlocks.Add(new UserBlock { BlockerId = userId, BlockedId = request.TargetUserId });
            await _dbContext.SaveChangesAsync();
            return Ok(new { Message = "User blocked successfully." });
        }

        [HttpDelete("blocks/{targetUserId}")]
        public async Task<IActionResult> UnblockUser(Guid targetUserId)
        {
            var userId = GetCurrentUserId();
            var block = await _dbContext.UserBlocks.FirstOrDefaultAsync(b => b.BlockerId == userId && b.BlockedId == targetUserId);
            if (block == null) return NotFound(new { Error = "Block rule not found." });

            _dbContext.UserBlocks.Remove(block);
            await _dbContext.SaveChangesAsync();
            return Ok(new { Message = "User unblocked successfully." });
        }

        [HttpPost("favorites")]
        public async Task<IActionResult> AddFavorite([FromBody] FavoriteRequest request)
        {
            var userId = GetCurrentUserId();
            var favExists = await _dbContext.FavoriteContacts.AnyAsync(f => f.UserId == userId && f.ContactId == request.TargetUserId);
            if (favExists) return BadRequest(new { Error = "User already in favorites." });

            _dbContext.FavoriteContacts.Add(new FavoriteContact { UserId = userId, ContactId = request.TargetUserId });
            await _dbContext.SaveChangesAsync();
            return Ok(new { Message = "User added to favorites." });
        }

        [HttpDelete("favorites/{targetUserId}")]
        public async Task<IActionResult> RemoveFavorite(Guid targetUserId)
        {
            var userId = GetCurrentUserId();
            var fav = await _dbContext.FavoriteContacts.FirstOrDefaultAsync(f => f.UserId == userId && f.ContactId == targetUserId);
            if (fav == null) return NotFound(new { Error = "Favorite not found." });

            _dbContext.FavoriteContacts.Remove(fav);
            await _dbContext.SaveChangesAsync();
            return Ok(new { Message = "User removed from favorites." });
        }



        [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("webrtc-ice")]
        [HttpGet("ice-servers")]
        public async Task<IActionResult> GetIceServers()
        {
            var userId = GetCurrentUserId();
            var credentials = _turnCredentialService.GenerateCredentials(userId);

            var iceServers = new System.Collections.Generic.List<object>();

            // 1. Group STUN and TURN URLs
            var stunUrls = credentials.Uris.Where(u => u.StartsWith("stun:", StringComparison.OrdinalIgnoreCase)).ToArray();
            var turnUrls = credentials.Uris.Where(u => u.StartsWith("turn:", StringComparison.OrdinalIgnoreCase) || u.StartsWith("turns:", StringComparison.OrdinalIgnoreCase)).ToArray();

            // 2. Populate STUN servers (always ensure at least one)
            if (stunUrls.Length > 0)
            {
                foreach (var stun in stunUrls)
                {
                    iceServers.Add(new { urls = stun });
                }
            }
            else
            {
                iceServers.Add(new { urls = "stun:stun.l.google.com:19302" }); // Fallback STUN
            }

            // 3. Populate TURN servers (with dynamic auth credentials)
            if (turnUrls.Length > 0 && !string.IsNullOrEmpty(credentials.Username))
            {
                iceServers.Add(new
                {
                    urls = turnUrls,
                    username = credentials.Username,
                    credential = credentials.Credential
                });
            }

            return Ok(new { iceServers });
        }

        // Keep old endpoint for backward compatibility — proxies to new one
        [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("webrtc-ice")]
        [HttpGet("turn-credentials")]
        public async Task<IActionResult> GetTurnCredentials() => await GetIceServers();



        [HttpPost("metrics")]
        public IActionResult PostMetrics([FromBody] object metrics)
        {
            var appLogger = HttpContext.RequestServices.GetService(typeof(Microsoft.Extensions.Logging.ILogger<CallController>)) as Microsoft.Extensions.Logging.ILogger<CallController>;
            appLogger?.LogInformation("TURN Analytics collected: {Metrics}", System.Text.Json.JsonSerializer.Serialize(metrics));
            return Ok();
        }

        private Guid GetCurrentUserId()
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return Guid.TryParse(userId, out Guid id) ? id : Guid.Empty;
        }

        public class RatingRequest { public int Rating { get; set; } public string? Feedback { get; set; } }
        public class BlockRequest { public Guid TargetUserId { get; set; } }
        public class FavoriteRequest { public Guid TargetUserId { get; set; } }
    }
}
