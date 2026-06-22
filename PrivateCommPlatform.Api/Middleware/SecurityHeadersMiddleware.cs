using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Middleware
{
    public class SecurityHeadersMiddleware
    {
        private readonly RequestDelegate _next;

        public SecurityHeadersMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            var path = context.Request.Path.Value ?? "";

            // Bypass strict CSP headers for API, SignalR, documentation, and OpenAPI endpoints
            if (!path.StartsWith("/scalar", System.StringComparison.OrdinalIgnoreCase) && 
                !path.StartsWith("/openapi", System.StringComparison.OrdinalIgnoreCase) &&
                !path.StartsWith("/api/", System.StringComparison.OrdinalIgnoreCase) &&
                !path.StartsWith("/chathub", System.StringComparison.OrdinalIgnoreCase))
            {
                context.Response.Headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; sandbox;";
                context.Response.Headers["X-Frame-Options"] = "DENY";
                context.Response.Headers["X-XSS-Protection"] = "1; mode=block";
                context.Response.Headers["X-Content-Type-Options"] = "nosniff";
                context.Response.Headers["Referrer-Policy"] = "no-referrer";
                context.Response.Headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
            }
            else
            {
                context.Response.Headers["X-Frame-Options"] = "SAMEORIGIN";
                context.Response.Headers["X-Content-Type-Options"] = "nosniff";
            }

            await _next(context);
        }
    }
}
