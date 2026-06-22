using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using PrivateCommPlatform.Api.Services;
using System;
using System.Security.Claims;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Middleware
{
    public class ActivityTrackerMiddleware
    {
        private readonly RequestDelegate _next;

        public ActivityTrackerMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            if (context.User.Identity?.IsAuthenticated == true)
            {
                var sessionIdClaim = context.User.FindFirst("sid")?.Value;
                if (Guid.TryParse(sessionIdClaim, out Guid sessionId))
                {
                    var sessionService = context.RequestServices.GetRequiredService<ISessionService>();

                    // 1. Session Revocation Check
                    var isActive = await sessionService.IsSessionActiveAsync(sessionId);
                    if (!isActive)
                    {
                        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                        await context.Response.WriteAsJsonAsync(new { Error = "Session has been revoked or expired." });
                        return;
                    }

                    // 2. Update Session Activity
                    await sessionService.UpdateSessionActivityAsync(sessionId);

                    // 3. Update User Last Activity
                    var userIdClaim = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                    if (Guid.TryParse(userIdClaim, out Guid userId))
                    {
                        var dbContext = context.RequestServices.GetRequiredService<Data.ApplicationDbContext>();
                        var user = await dbContext.Users.FindAsync(userId);
                        if (user != null)
                        {
                            user.LastActivityDate = DateTimeOffset.UtcNow;
                            await dbContext.SaveChangesAsync();
                        }
                    }
                }
            }

            await _next(context);
        }
    }
}
