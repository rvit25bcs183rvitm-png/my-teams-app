using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrivateCommPlatform.Api.Services;
using System;
using System.Security.Claims;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class PresenceController : ControllerBase
    {
        private readonly IPresenceService _presenceService;

        public PresenceController(IPresenceService presenceService)
        {
            _presenceService = presenceService;
        }

        public class StatusOverrideRequest
        {
            public string? Status { get; set; } // Online, Offline, Away, Busy, DoNotDisturb, or null to clear override
        }

        [HttpGet]
        public async Task<IActionResult> GetTeamStatuses()
        {
            var statuses = await _presenceService.GetAllPresenceAsync();
            return Ok(statuses);
        }

        [HttpPost("status")]
        public async Task<IActionResult> OverrideStatus([FromBody] StatusOverrideRequest request)
        {
            var currentUserId = GetCurrentUserId();

            if (request.Status != null)
            {
                var upperStatus = request.Status.ToUpperInvariant();
                var allowedStatuses = new[] { "ONLINE", "OFFLINE", "AWAY", "BUSY", "DONOTDISTURB" };
                if (!allowedStatuses.Contains(upperStatus))
                {
                    return BadRequest(new { Error = "Invalid status override. Must be Online, Offline, Away, Busy, or DoNotDisturb." });
                }
            }

            await _presenceService.SetPresenceOverrideAsync(currentUserId, request.Status);
            return Ok(new { Message = "Presence status updated." });
        }

        private Guid GetCurrentUserId()
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return Guid.TryParse(userId, out Guid id) ? id : Guid.Empty;
        }
    }
}
