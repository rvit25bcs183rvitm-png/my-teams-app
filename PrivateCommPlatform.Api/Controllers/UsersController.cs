using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using PrivateCommPlatform.Api.Models.DTOs;
using PrivateCommPlatform.Api.Services;
using System;
using System.Security.Claims;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class UsersController : ControllerBase
    {
        private readonly IUserService _userService;
        private readonly IAuditService _auditService;

        public UsersController(IUserService userService, IAuditService auditService)
        {
            _userService = userService;
            _auditService = auditService;
        }

        private string GetClientIpAddress() =>
            Request.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "0.0.0.0";

        [HttpPost]
        [Authorize(Roles = "Super Administrator,Administrator")]
        [ProducesResponseType(StatusCodes.Status201Created)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request)
        {
            var adminIdString = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var adminUsername = User.FindFirst(ClaimTypes.Name)?.Value ?? "Admin";
            Guid.TryParse(adminIdString, out Guid adminId);

            var result = await _userService.CreateUserAsync(request, adminId, adminUsername);
            return CreatedAtAction(nameof(GetUserById), new { id = result.UserId }, result);
        }

        [HttpPut("{id}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> UpdateUser(Guid id, [FromBody] UpdateUserRequest request)
        {
            var actorIdString = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var actorUsername = User.FindFirst(ClaimTypes.Name)?.Value ?? "User";
            if (!Guid.TryParse(actorIdString, out Guid actorId))
            {
                return BadRequest();
            }

            var isUserAdmin = User.IsInRole("Super Administrator") || User.IsInRole("Administrator");
            if (actorId != id && !isUserAdmin)
            {
                return Forbid();
            }

            await _userService.UpdateUserAsync(id, request, actorId, actorUsername);
            return NoContent();
        }

        [HttpPost("{id}/deactivate")]
        [Authorize(Roles = "Super Administrator,Administrator")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> DeactivateUser(Guid id)
        {
            var ipAddress = GetClientIpAddress();
            var actorIdString = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var actorUsername = User.FindFirst(ClaimTypes.Name)?.Value ?? "Admin";
            Guid.TryParse(actorIdString, out Guid actorId);

            if (actorId == id)
            {
                return BadRequest(new { Error = "Self-deactivation is prohibited." });
            }

            await _userService.DeactivateUserAsync(id, actorId, actorUsername, ipAddress);
            return NoContent();
        }

        [HttpPost("{id}/reset-password")]
        [Authorize(Roles = "Super Administrator,Administrator")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> ResetPassword(Guid id)
        {
            var ipAddress = GetClientIpAddress();
            var actorIdString = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var actorUsername = User.FindFirst(ClaimTypes.Name)?.Value ?? "Admin";
            Guid.TryParse(actorIdString, out Guid actorId);

            string tempPassword = await _userService.ResetPasswordAsync(id, actorId, actorUsername, ipAddress);
            return Ok(new { TemporaryPassword = tempPassword });
        }

        [HttpGet]
        [Authorize(Roles = "Super Administrator,Administrator,Manager,Employee,Family Member")]
        public async Task<IActionResult> GetUsers()
        {
            var users = await _userService.GetUsersAsync();
            return Ok(users);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetUserById(Guid id)
        {
            var actorIdString = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            Guid.TryParse(actorIdString, out Guid actorId);

            var isAuthorized = User.IsInRole("Super Administrator") || 
                               User.IsInRole("Administrator") || 
                               User.IsInRole("Manager") || 
                               actorId == id;

            if (!isAuthorized)
            {
                return Forbid();
            }

            var user = await _userService.GetUserByIdAsync(id);
            if (user == null)
            {
                return NotFound();
            }

            return Ok(user);
        }
    }
}
