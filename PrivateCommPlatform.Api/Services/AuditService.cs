using Microsoft.AspNetCore.Http;
using PrivateCommPlatform.Api.Data;
using PrivateCommPlatform.Api.Models.Entities;
using System;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Services
{
    public interface IAuditService
    {
        Task LogAuditAsync(Guid? actorId, string actorUsername, string action, Guid? targetId, string detailsObj);
        Task LogSecurityEventAsync(string eventType, string? username, string details);
    }

    public class AuditService : IAuditService
    {
        private readonly ApplicationDbContext _dbContext;
        private readonly IHttpContextAccessor _httpContextAccessor;

        public AuditService(ApplicationDbContext dbContext, IHttpContextAccessor httpContextAccessor)
        {
            _dbContext = dbContext;
            _httpContextAccessor = httpContextAccessor;
        }

        private string GetClientIpAddress()
        {
            var ip = _httpContextAccessor.HttpContext?.Connection?.RemoteIpAddress?.ToString();
            return string.IsNullOrEmpty(ip) ? "0.0.0.0" : ip;
        }

        private string GetUserAgent()
        {
            return _httpContextAccessor.HttpContext?.Request?.Headers["User-Agent"].ToString() ?? "Unknown";
        }

        public async Task LogAuditAsync(Guid? actorId, string actorUsername, string action, Guid? targetId, string detailsObj)
        {
            var ipAddress = GetClientIpAddress();
            var userAgent = GetUserAgent();

            var auditLog = new AuditLog
            {
                Id = Guid.NewGuid(),
                Timestamp = DateTimeOffset.UtcNow,
                ActorId = actorId,
                ActorUsername = string.IsNullOrEmpty(actorUsername) ? "System" : actorUsername,
                Action = action,
                TargetId = targetId,
                IpAddress = ipAddress,
                UserAgent = userAgent,
                Details = detailsObj
            };

            _dbContext.AuditLogs.Add(auditLog);
            await _dbContext.SaveChangesAsync();
        }

        public async Task LogSecurityEventAsync(string eventType, string? username, string details)
        {
            var ipAddress = GetClientIpAddress();

            var securityEvent = new SecurityEvent
            {
                Id = Guid.NewGuid(),
                Timestamp = DateTimeOffset.UtcNow,
                EventType = eventType,
                IpAddress = ipAddress,
                Username = username,
                Details = details
            };

            _dbContext.SecurityEvents.Add(securityEvent);
            await _dbContext.SaveChangesAsync();
        }
    }
}
