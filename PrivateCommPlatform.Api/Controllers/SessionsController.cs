using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using PrivateCommPlatform.Api.Services;
using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class SessionsController : ControllerBase
    {
        private readonly ISessionService _sessionService;
        private readonly IAuditService _auditService;

        public SessionsController(ISessionService sessionService, IAuditService auditService)
        {
            _sessionService = sessionService;
            _auditService = auditService;
        }

        private string GetClientIpAddress() =>
            Request.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "0.0.0.0";

        [HttpGet("active")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public async Task<IActionResult> GetActiveSessions()
        {
            var userIdString = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!Guid.TryParse(userIdString, out Guid userId))
            {
                return BadRequest();
            }

            var currentSessionIdClaim = User.FindFirst("sid")?.Value;
            Guid.TryParse(currentSessionIdClaim, out Guid currentSessionId);

            var sessions = await _sessionService.GetActiveSessionsAsync(userId);
            var result = sessions.Select(s => new
            {
                s.Id,
                s.DeviceName,
                s.DeviceType,
                s.IpAddress,
                s.LoginTime,
                s.LastActivity,
                IsCurrentSession = s.Id == currentSessionId
            });

            return Ok(result);
        }

        [HttpPost("revoke/{id}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> RevokeSession(Guid id)
        {
            var ipAddress = GetClientIpAddress();
            var userIdString = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var username = User.FindFirst(ClaimTypes.Name)?.Value ?? "User";
            if (!Guid.TryParse(userIdString, out Guid userId))
            {
                return BadRequest();
            }

            var activeSessions = await _sessionService.GetActiveSessionsAsync(userId);
            var sessionToRevoke = activeSessions.FirstOrDefault(s => s.Id == id);

            if (sessionToRevoke == null)
            {
                var isUserAdmin = User.IsInRole("Super Administrator") || User.IsInRole("Administrator");
                if (!isUserAdmin)
                {
                    return Forbid();
                }
            }

            bool result = await _sessionService.RevokeSessionAsync(id, ipAddress);
            if (!result)
            {
                return BadRequest(new { Error = "Session already revoked or not found." });
            }

            await _auditService.LogAuditAsync(userId, username, "SESSION_REVOKED", id, $"Revoked session {id}.");
            return NoContent();
        }

        [HttpPost("revoke-all")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> RevokeAllSessions()
        {
            var ipAddress = GetClientIpAddress();
            var userIdString = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var username = User.FindFirst(ClaimTypes.Name)?.Value ?? "User";
            if (!Guid.TryParse(userIdString, out Guid userId))
            {
                return BadRequest();
            }

            var currentSessionIdClaim = User.FindFirst("sid")?.Value;
            if (!Guid.TryParse(currentSessionIdClaim, out Guid currentSessionId))
            {
                return BadRequest();
            }

            await _sessionService.RevokeAllUserSessionsExceptCurrentAsync(userId, currentSessionId, ipAddress);
            await _auditService.LogAuditAsync(userId, username, "ALL_SESSIONS_REVOKED_EXCEPT_CURRENT", userId, "Revoked all sessions except current.");
            return NoContent();
        }
    }
}
