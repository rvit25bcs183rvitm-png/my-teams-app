using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Razorpay.Api;
using PrivateCommPlatform.Api.Data;
using PrivateCommPlatform.Api.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace PrivateCommPlatform.Api.Services
{
    public class OrderResult
    {
        public string OrderId { get; set; } = string.Empty;
        public string Currency { get; set; } = "USD";
        public int Amount { get; set; }
    }

    public interface IBillingService
    {
        Task<string> DetectUserCountryAsync(string ipAddress);
        Task<string> GetCurrencyForCountryAsync(string countryCode);
        Task<OrderResult> CreateOrderAsync(Guid userId, string planId);
        Task VerifyPaymentAsync(string razorpayOrderId, string razorpayPaymentId, string razorpaySignature);
        Task SyncUserCountryAndCurrencyAsync(Guid userId, string ipAddress);
    }

    public class BillingService : IBillingService
    {
        private readonly ApplicationDbContext _dbContext;
        private readonly IConfiguration _config;
        private readonly string _razorpayKeyId;
        private readonly string _razorpayKeySecret;

        public BillingService(ApplicationDbContext dbContext, IConfiguration config)
        {
            _dbContext = dbContext;
            _config = config;
            _razorpayKeyId = _config["Razorpay:KeyId"] ?? "";
            _razorpayKeySecret = _config["Razorpay:KeySecret"] ?? "";
        }

        public Task<string> DetectUserCountryAsync(string ipAddress)
        {
            // Mock implementation
            return Task.FromResult("IN");
        }

        public Task<string> GetCurrencyForCountryAsync(string countryCode)
        {
            // Support multi-currency based on country.
            if (countryCode == "IN") return Task.FromResult("INR");
            return Task.FromResult("USD");
        }

        public async Task SyncUserCountryAndCurrencyAsync(Guid userId, string ipAddress)
        {
            var user = await _dbContext.Users.FindAsync(userId);
            if (user == null) return;

            if (string.IsNullOrEmpty(user.CountryCode))
            {
                user.CountryCode = await DetectUserCountryAsync(ipAddress);
                user.Currency = await GetCurrencyForCountryAsync(user.CountryCode);
                await _dbContext.SaveChangesAsync();
            }
        }

        public async Task<OrderResult> CreateOrderAsync(Guid userId, string planId)
        {
            var user = await _dbContext.Users.FindAsync(userId);
            if (user == null) throw new Exception("User not found");

            var client = new RazorpayClient(_razorpayKeyId, _razorpayKeySecret);

            // 1. Ensure Razorpay Customer Exists
            if (string.IsNullOrEmpty(user.RazorpayCustomerId))
            {
                if (!string.IsNullOrEmpty(_razorpayKeyId))
                {
                    var customerOptions = new Dictionary<string, object>
                    {
                        { "name", $"{user.FirstName} {user.LastName}" },
                        { "email", user.Email }
                    };
                    
                    var customer = client.Customer.Create(customerOptions);
                    user.RazorpayCustomerId = customer["id"].ToString();
                    await _dbContext.SaveChangesAsync();
                }
            }

            // 2. Map Plan ID to Pricing
            var currency = user.Currency?.ToUpper() ?? "USD";
            int amountInSubunits = 0; // e.g. Paise for INR, Cents for USD

            if (planId.Equals("business", StringComparison.OrdinalIgnoreCase))
            {
                amountInSubunits = currency == "INR" ? 120000 : 1500; // ₹1200 or $15
            }
            else if (planId.Equals("usage", StringComparison.OrdinalIgnoreCase))
            {
                amountInSubunits = currency == "INR" ? 40000 : 500; // ₹400 or $5
            }
            else
            {
                throw new Exception("Invalid plan type selected");
            }

            // 3. Create Razorpay Order
            var orderOptions = new Dictionary<string, object>
            {
                { "amount", amountInSubunits },
                { "currency", currency },
                { "receipt", $"rcptid_{Guid.NewGuid().ToString("N").Substring(0, 10)}" }
            };

            var order = client.Order.Create(orderOptions);
            var orderId = order["id"].ToString();

            // Create ledger entry
            var transaction = new PaymentTransaction
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                RazorpayOrderId = orderId,
                PlanId = planId,
                Amount = (decimal)amountInSubunits / 100m,
                Currency = currency,
                Status = "Pending",
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };

            _dbContext.PaymentTransactions.Add(transaction);
            await _dbContext.SaveChangesAsync();

            return new OrderResult
            {
                OrderId = orderId,
                Currency = currency,
                Amount = amountInSubunits
            };
        }

        public async Task VerifyPaymentAsync(string razorpayOrderId, string razorpayPaymentId, string razorpaySignature)
        {
            string payload = $"{razorpayOrderId}|{razorpayPaymentId}";
            using (var hmac = new System.Security.Cryptography.HMACSHA256(System.Text.Encoding.UTF8.GetBytes(_razorpayKeySecret)))
            {
                var hashBytes = hmac.ComputeHash(System.Text.Encoding.UTF8.GetBytes(payload));
                var generatedSignature = BitConverter.ToString(hashBytes).Replace("-", "").ToLower();
                if (generatedSignature != razorpaySignature)
                {
                    var tx = await _dbContext.PaymentTransactions.FirstOrDefaultAsync(t => t.RazorpayOrderId == razorpayOrderId);
                    if (tx != null)
                    {
                        tx.Status = "Failed";
                        tx.RazorpayPaymentId = razorpayPaymentId;
                        tx.RazorpaySignature = razorpaySignature;
                        tx.UpdatedAt = DateTimeOffset.UtcNow;
                        await _dbContext.SaveChangesAsync();
                    }
                    throw new Exception("Payment signature verification failed.");
                }
            }

            var transaction = await _dbContext.PaymentTransactions.FirstOrDefaultAsync(t => t.RazorpayOrderId == razorpayOrderId);
            if (transaction != null)
            {
                transaction.Status = "Success";
                transaction.RazorpayPaymentId = razorpayPaymentId;
                transaction.RazorpaySignature = razorpaySignature;
                transaction.UpdatedAt = DateTimeOffset.UtcNow;
                await _dbContext.SaveChangesAsync();
            }
        }
    }
}
