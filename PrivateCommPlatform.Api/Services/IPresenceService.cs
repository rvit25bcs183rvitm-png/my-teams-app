using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Services
{
    public interface IPresenceService
    {
        Task SetPresenceOverrideAsync(Guid userId, string? status);
        Task<string> GetPresenceAsync(Guid userId);
        Task<Dictionary<Guid, string>> GetAllPresenceAsync();
        Task RegisterConnectionAsync(Guid userId, string connectionId);
        Task DeregisterConnectionAsync(Guid userId, string connectionId);
    }
}
