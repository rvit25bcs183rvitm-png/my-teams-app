using Microsoft.EntityFrameworkCore;
using PrivateCommPlatform.Api.Data;
using PrivateCommPlatform.Api.Models.Entities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Services
{
    public interface ISessionService
    {
        Task<Session> CreateSessionAsync(Guid userId, string deviceName, string deviceType, string ipAddress);
        Task UpdateSessionActivityAsync(Guid sessionId);
        Task<IEnumerable<Session>> GetActiveSessionsAsync(Guid userId);
        Task<bool> RevokeSessionAsync(Guid sessionId, string ipAddress);
        Task RevokeAllUserSessionsExceptCurrentAsync(Guid userId, Guid currentSessionId, string ipAddress);
        Task<bool> IsSessionActiveAsync(Guid sessionId);
    }

    public class SessionService : ISessionService
    {
        private readonly ApplicationDbContext _dbContext;

        public SessionService(ApplicationDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        public async Task<Session> CreateSessionAsync(Guid userId, string deviceName, string deviceType, string ipAddress)
        {
            var session = new Session
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                DeviceName = deviceName,
                DeviceType = deviceType,
                IpAddress = ipAddress,
                LoginTime = DateTimeOffset.UtcNow,
                LastActivity = DateTimeOffset.UtcNow,
                IsRevoked = false
            };

            _dbContext.Sessions.Add(session);
            await _dbContext.SaveChangesAsync();
            return session;
        }

        public async Task UpdateSessionActivityAsync(Guid sessionId)
        {
            var session = await _dbContext.Sessions.FindAsync(sessionId);
            if (session != null && !session.IsRevoked)
            {
                session.LastActivity = DateTimeOffset.UtcNow;
                await _dbContext.SaveChangesAsync();
            }
        }

        public async Task<IEnumerable<Session>> GetActiveSessionsAsync(Guid userId)
        {
            return await _dbContext.Sessions
                .Where(s => s.UserId == userId && !s.IsRevoked)
                .OrderByDescending(s => s.LastActivity)
                .ToListAsync();
        }

        public async Task<bool> RevokeSessionAsync(Guid sessionId, string ipAddress)
        {
            var session = await _dbContext.Sessions
                .Include(s => s.RefreshTokens)
                .FirstOrDefaultAsync(s => s.Id == sessionId);

            if (session == null || session.IsRevoked)
            {
                return false;
            }

            session.IsRevoked = true;

            // Revoke associated active refresh tokens
            foreach (var token in session.RefreshTokens.Where(t => t.IsActive))
            {
                token.RevokedDate = DateTimeOffset.UtcNow;
                token.RevokedByIp = ipAddress;
            }

            await _dbContext.SaveChangesAsync();
            return true;
        }

        public async Task RevokeAllUserSessionsExceptCurrentAsync(Guid userId, Guid currentSessionId, string ipAddress)
        {
            var sessions = await _dbContext.Sessions
                .Include(s => s.RefreshTokens)
                .Where(s => s.UserId == userId && s.Id != currentSessionId && !s.IsRevoked)
                .ToListAsync();

            foreach (var session in sessions)
            {
                session.IsRevoked = true;
                foreach (var token in session.RefreshTokens.Where(t => t.IsActive))
                {
                    token.RevokedDate = DateTimeOffset.UtcNow;
                    token.RevokedByIp = ipAddress;
                }
            }

            await _dbContext.SaveChangesAsync();
        }

        public async Task<bool> IsSessionActiveAsync(Guid sessionId)
        {
            var session = await _dbContext.Sessions.FindAsync(sessionId);
            return session != null && !session.IsRevoked;
        }
    }
}
