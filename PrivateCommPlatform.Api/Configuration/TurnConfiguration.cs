using System;

namespace PrivateCommPlatform.Api.Configuration
{
    public class TurnConfiguration
    {
        public bool Enabled { get; set; }
        public string Secret { get; set; } = string.Empty;
        public string Realm { get; set; } = string.Empty;
        public string[] Uris { get; set; } = Array.Empty<string>();
        public int ExpirySeconds { get; set; } = 3600;
    }
}
