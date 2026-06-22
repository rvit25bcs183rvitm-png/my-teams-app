using System;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using PrivateCommPlatform.Api.Configuration;

namespace PrivateCommPlatform.Api.Services
{
    public class TurnCredentials
    {
        public string Username { get; set; } = string.Empty;
        public string Credential { get; set; } = string.Empty;
        public long TtlSeconds { get; set; }
        public string[] Uris { get; set; } = Array.Empty<string>();
    }

    public interface ITurnCredentialService
    {
        TurnCredentials GenerateCredentials(Guid userId);
    }

    public class TurnCredentialService : ITurnCredentialService
    {
        private readonly TurnConfiguration _options;
        private readonly Microsoft.Extensions.Logging.ILogger<TurnCredentialService> _logger;

        public TurnCredentialService(IOptions<TurnConfiguration> options, Microsoft.Extensions.Logging.ILogger<TurnCredentialService> logger)
        {
            _options = options.Value;
            _logger = logger;
        }

        public TurnCredentials GenerateCredentials(Guid userId)
        {
            var secret = _options.Secret;
            var uris = _options.Uris;

            if (!_options.Enabled || string.IsNullOrEmpty(secret) || uris == null || uris.Length == 0)
            {
                _logger.LogWarning("TURN is disabled or misconfigured. Falling back to STUN.");
                // Fallback for development if not configured or disabled
                return new TurnCredentials
                {
                    Uris = new[] { "stun:stun.l.google.com:19302" }
                };
            }

            var expirySeconds = DateTimeOffset.UtcNow.AddSeconds(_options.ExpirySeconds).ToUnixTimeSeconds();
            var username = $"{expirySeconds}:{userId}";

            using var hmac = new HMACSHA1(Encoding.UTF8.GetBytes(secret));
            var credentialBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(username));
            var credential = Convert.ToBase64String(credentialBytes);

            _logger.LogInformation("TURN Diagnostics => Enabled: {Enabled}, Realm: {Realm}, Secret Loaded: {Secret}, Username: {Username}, Credential: {Credential}, Expiry: {Expiry}, URIs: {Uris}",
                _options.Enabled, _options.Realm, !string.IsNullOrEmpty(secret) ? "YES" : "NO", username, credential, expirySeconds, string.Join(", ", uris));

            return new TurnCredentials
            {
                Username = username,
                Credential = credential,
                TtlSeconds = _options.ExpirySeconds,
                Uris = uris
            };
        }
    }
}
