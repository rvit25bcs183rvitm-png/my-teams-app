using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrivateCommPlatform.Api.Services;
using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using PrivateCommPlatform.Api.Data;
using PrivateCommPlatform.Api.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace PrivateCommPlatform.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class BillingController : ControllerBase
    {
        private readonly IBillingService _billingService;
        private readonly ILogger<BillingController> _logger;
        private readonly ApplicationDbContext _dbContext;

        public BillingController(IBillingService billingService, ILogger<BillingController> logger, ApplicationDbContext dbContext)
        {
            _billingService = billingService;
            _logger = logger;
            _dbContext = dbContext;
        }

        public class CreateCheckoutRequest
        {
            public string PlanId { get; set; } = string.Empty;
        }

        [HttpPost("create-checkout-session")]
        [Authorize]
        public async Task<IActionResult> CreateCheckoutSession([FromBody] CreateCheckoutRequest request)
        {
            var userIdStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdStr) || !Guid.TryParse(userIdStr, out var userId))
            {
                return Unauthorized();
            }

            try
            {
                // Ensure currency and country are synced for pricing logic
                var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "0.0.0.0";
                await _billingService.SyncUserCountryAndCurrencyAsync(userId, ipAddress);

                var order = await _billingService.CreateOrderAsync(userId, request.PlanId);

                return Ok(new { orderId = order.OrderId, amount = order.Amount, currency = order.Currency });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating checkout session");
                return BadRequest(new { error = ex.Message });
            }
        }

        public class VerifyPaymentRequest
        {
            public string RazorpayOrderId { get; set; } = string.Empty;
            public string RazorpayPaymentId { get; set; } = string.Empty;
            public string RazorpaySignature { get; set; } = string.Empty;
            public string PlanId { get; set; } = string.Empty;
        }

        [HttpPost("verify-payment")]
        [Authorize]
        public async Task<IActionResult> VerifyPayment([FromBody] VerifyPaymentRequest request)
        {
            var userIdStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdStr) || !Guid.TryParse(userIdStr, out var userId))
            {
                return Unauthorized();
            }

            try
            {
                await _billingService.VerifyPaymentAsync(request.RazorpayOrderId, request.RazorpayPaymentId, request.RazorpaySignature);

                // If verification passes without throwing an exception, upgrade the user's plan
                var user = await _dbContext.Users.FindAsync(userId);
                if (user != null)
                {
                    user.SubscriptionPlan = request.PlanId.Equals("business", StringComparison.OrdinalIgnoreCase) ? "BusinessPro" : "UsageBased";
                    user.SubscriptionStatus = "Active";
                    user.SubscriptionStartDate = DateTime.UtcNow;
                    user.SubscriptionEndDate = DateTime.UtcNow.AddMonths(1);
                    await _dbContext.SaveChangesAsync();
                }

                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Razorpay Webhook/Verification failed");
                return BadRequest(new { error = "Signature verification failed" });
            }
        }

        [HttpGet("transactions")]
        [Authorize]
        public async Task<IActionResult> GetTransactions()
        {
            var userIdStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdStr) || !Guid.TryParse(userIdStr, out var userId))
            {
                return Unauthorized();
            }

            try
            {
                var transactions = await _dbContext.PaymentTransactions
                    .Where(t => t.UserId == userId)
                    .OrderByDescending(t => t.CreatedAt)
                    .Select(t => new
                    {
                        t.Id,
                        t.RazorpayOrderId,
                        t.RazorpayPaymentId,
                        t.PlanId,
                        t.Amount,
                        t.Currency,
                        t.Status,
                        CreatedAt = t.CreatedAt.ToString("o"),
                        UpdatedAt = t.UpdatedAt.ToString("o")
                    })
                    .ToListAsync();

                return Ok(transactions);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching transactions");
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("webhook")]
        [AllowAnonymous]
        public async Task<IActionResult> RazorpayWebhook()
        {
            try
            {
                using var reader = new System.IO.StreamReader(Request.Body);
                var json = await reader.ReadToEndAsync();

                _logger.LogInformation("Received Razorpay Webhook callback. Payload: {Payload}", json);

                using var doc = System.Text.Json.JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (root.TryGetProperty("event", out var eventProp))
                {
                    var eventType = eventProp.GetString();
                    if (eventType == "order.paid" || eventType == "payment.captured")
                    {
                        var payload = root.GetProperty("payload");
                        var payment = payload.GetProperty("payment").GetProperty("entity");
                        var orderId = payment.GetProperty("order_id").GetString();
                        var paymentId = payment.GetProperty("id").GetString();
                        var signature = Request.Headers["X-Razorpay-Signature"].ToString() ?? "";

                        var transaction = await _dbContext.PaymentTransactions.FirstOrDefaultAsync(t => t.RazorpayOrderId == orderId);
                        if (transaction != null && transaction.Status != "Success")
                        {
                            transaction.Status = "Success";
                            transaction.RazorpayPaymentId = paymentId;
                            transaction.RazorpaySignature = signature;
                            transaction.UpdatedAt = DateTimeOffset.UtcNow;

                            var user = await _dbContext.Users.FindAsync(transaction.UserId);
                            if (user != null)
                            {
                                user.SubscriptionPlan = transaction.PlanId.Equals("business", StringComparison.OrdinalIgnoreCase) ? "BusinessPro" : "UsageBased";
                                user.SubscriptionStatus = "Active";
                                user.SubscriptionStartDate = DateTime.UtcNow;
                                user.SubscriptionEndDate = DateTime.UtcNow.AddMonths(1);
                            }

                            await _dbContext.SaveChangesAsync();
                            _logger.LogInformation("Webhook: Successfully upgraded user {UserId} to plan {PlanId} for OrderId {OrderId}", 
                                transaction.UserId, transaction.PlanId, orderId);
                        }
                    }
                }

                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing Razorpay Webhook");
                return Ok(new { success = false, error = ex.Message });
            }
        }
    }
}
