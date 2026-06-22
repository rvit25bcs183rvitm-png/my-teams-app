using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using PrivateCommPlatform.Api.Data;
using PrivateCommPlatform.Api.Hubs;
using PrivateCommPlatform.Api.Middleware;
using PrivateCommPlatform.Api.Services;
using Scalar.AspNetCore;
using System;
using System.Text;
using System.Threading.RateLimiting;

// Load environment variables from .env file if it exists (for development / local running)
var envPath = System.IO.Path.Combine(System.IO.Directory.GetCurrentDirectory(), ".env");
if (System.IO.File.Exists(envPath))
{
    foreach (var line in System.IO.File.ReadAllLines(envPath))
    {
        var trimmed = line.Trim();
        if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith("#")) continue;
        var parts = trimmed.Split('=', 2);
        if (parts.Length == 2)
        {
            var key = parts[0].Trim();
            var val = parts[1].Trim();
            if (val.StartsWith("\"") && val.EndsWith("\"")) val = val.Substring(1, val.Length - 2);
            if (val.StartsWith("'") && val.EndsWith("'")) val = val.Substring(1, val.Length - 2);
            Environment.SetEnvironmentVariable(key, val);
        }
    }
}

var builder = WebApplication.CreateBuilder(args);

// Ensure configuration binds environment variables
builder.Configuration.AddEnvironmentVariables();


// 1. Add DB Context
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyHeader()
              .AllowAnyMethod()
              .SetIsOriginAllowed(_ => true)
              .AllowCredentials();
    });
});

// 2. Add DI Services
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<IPasswordHasher, PasswordHasher>();
builder.Services.AddScoped<IPasswordValidator, PasswordValidator>();
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<ISessionService, SessionService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddScoped<IBillingService, BillingService>();

// Add Presence, Message and Sync Services for Component 2
builder.Services.AddSingleton<IPresenceService, PresenceService>();
builder.Services.AddScoped<IMessageService, MessageService>();
builder.Services.AddScoped<ISyncService, SyncService>();
builder.Services.AddScoped<IStorageService, StorageService>();
builder.Services.AddScoped<ICallService, CallService>();
builder.Services.AddSingleton<ICallStateManager, CallStateManager>();
builder.Services.Configure<PrivateCommPlatform.Api.Configuration.TurnConfiguration>(builder.Configuration.GetSection("Turn"));
builder.Services.AddScoped<ITurnCredentialService, TurnCredentialService>();
builder.Services.AddHostedService<SubscriptionExpirationWorker>();

// Add SignalR services
builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = true;
});

// 3. Add JWT Authentication
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false; // Set to true in production
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidAudience = builder.Configuration["Jwt:Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Secret"]!))
    };

    // Support JWT token passed in query string for SignalR hub connections
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && (path.StartsWithSegments("/chathub") || path.StartsWithSegments("/callhub")))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
});

// 4. Add Rate Limiting
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("login", opt =>
    {
        opt.Window = TimeSpan.FromMinutes(1);
        opt.PermitLimit = 5;
        opt.QueueLimit = 0;
    });
    options.AddFixedWindowLimiter("global", opt =>
    {
        opt.Window = TimeSpan.FromSeconds(10);
        opt.PermitLimit = 100;
        opt.QueueLimit = 0;
    });
    options.AddPolicy("webrtc-ice", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? httpContext.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
            factory: partition => new FixedWindowRateLimiterOptions
            {
                AutoReplenishment = true,
                PermitLimit = 10,
                QueueLimit = 0,
                Window = TimeSpan.FromMinutes(1)
            }));
});

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    });
builder.Services.AddOpenApi();

var app = builder.Build();

// 5. Database Seeding & Initialization & Configuration Validation
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var turnConfig = services.GetRequiredService<Microsoft.Extensions.Options.IOptions<PrivateCommPlatform.Api.Configuration.TurnConfiguration>>().Value;
        var appLogger = services.GetRequiredService<ILogger<Program>>();
        appLogger.LogInformation("Turn configuration loaded successfully: Enabled={Enabled}, UrisCount={Count}, Realm={Realm}, Expiry={Expiry}", 
            turnConfig.Enabled, turnConfig.Uris?.Length ?? 0, turnConfig.Realm, turnConfig.ExpirySeconds);

        if (turnConfig.Enabled)
        {
            if (string.IsNullOrEmpty(turnConfig.Secret) || turnConfig.Uris == null || turnConfig.Uris.Length == 0)
            {
                appLogger.LogCritical("TURN configuration failed to bind properly. Secret or Uris are missing.");
                throw new InvalidOperationException("TURN configuration failed to bind properly. Secret or Uris are missing.");
            }
            
            // Ping test
            appLogger.LogInformation("Performing startup ping test to TURN server...");
            try
            {
                using var client1 = new System.Net.Sockets.TcpClient();
                using var cts1 = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(5));
                await client1.ConnectAsync("turn.teambridge.tech", 3478, cts1.Token);

                using var client2 = new System.Net.Sockets.TcpClient();
                using var cts2 = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(5));
                await client2.ConnectAsync("turn.teambridge.tech", 5349, cts2.Token);
                
                appLogger.LogInformation("TURN server TCP ping tests passed successfully.");
            }
            catch (Exception ex)
            {
                appLogger.LogWarning(ex, "TURN server unreachable at turn.teambridge.tech. Continuing startup anyway.");
                // throw new InvalidOperationException("TURN server unreachable. Startup aborted.", ex);
            }
        }

        var context = services.GetRequiredService<ApplicationDbContext>();
        var passwordHasher = services.GetRequiredService<IPasswordHasher>();
        await DbInitializer.InitializeAsync(context, passwordHasher);
    }
    catch (Exception ex)
    {
        var logger = services.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex, "An error occurred during startup initialization.");
        throw;
    }
}

// 6. Request Pipeline configuration
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseMiddleware<SecurityHeadersMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseHttpsRedirection();
app.UseCors("AllowAll");
app.UseRateLimiter();

app.UseAuthentication();
app.UseAuthorization();

// Activity tracking runs after auth/authz so context.User claims are available
app.UseMiddleware<ActivityTrackerMiddleware>();

app.MapControllers();
app.MapHub<ChatHub>("/chathub");
app.MapHub<CallHub>("/callhub");

app.Run();
