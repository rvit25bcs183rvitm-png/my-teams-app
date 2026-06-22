using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PrivateCommPlatform.Api.Data;

namespace PrivateCommPlatform.Api.Services
{
    public class SubscriptionExpirationWorker : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<SubscriptionExpirationWorker> _logger;

        public SubscriptionExpirationWorker(IServiceProvider serviceProvider, ILogger<SubscriptionExpirationWorker> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Subscription Expiration Background Worker started.");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await CheckExpiredSubscriptionsAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "An error occurred while checking expired subscriptions in background worker.");
                }

                // Check every 30 seconds for testing/development timeline transitions
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
        }

        private async Task CheckExpiredSubscriptionsAsync()
        {
            using (var scope = _serviceProvider.CreateScope())
            {
                var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var auditService = scope.ServiceProvider.GetRequiredService<IAuditService>();

                var now = DateTime.UtcNow;

                // Find users whose subscription has ended and status is "Active", and plan is not "Free"
                var expiredUsers = dbContext.Users
                    .Where(u => u.SubscriptionPlan != "Free"
                                && u.SubscriptionEndDate != null
                                && u.SubscriptionEndDate <= now
                                && u.SubscriptionStatus == "Active")
                    .ToList();

                if (expiredUsers.Any())
                {
                    _logger.LogInformation("Background billing check: found {Count} expired subscriptions.", expiredUsers.Count);
                    foreach (var user in expiredUsers)
                    {
                        var oldPlan = user.SubscriptionPlan;
                        user.SubscriptionPlan = "Free";
                        user.SubscriptionStatus = "Expired";

                        _logger.LogInformation("Downgraded user {UserId} ({Email}) from plan {OldPlan} to Free due to subscription expiration.", 
                            user.Id, user.Email, oldPlan);

                        await auditService.LogAuditAsync(
                            actorId: null, 
                            actorUsername: "System", 
                            action: "SubscriptionExpired", 
                            targetId: user.Id, 
                            detailsObj: $"{{\"OldPlan\":\"{oldPlan}\",\"ExpiredAt\":\"{user.SubscriptionEndDate}\"}}"
                        );
                    }

                    await dbContext.SaveChangesAsync();
                }
            }
        }
    }
}
