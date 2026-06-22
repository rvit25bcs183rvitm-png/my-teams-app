using Konscious.Security.Cryptography;
using System;
using System.Security.Cryptography;
using System.Text;

namespace PrivateCommPlatform.Api.Services
{
    public interface IPasswordHasher
    {
        string HashPassword(string password);
        bool VerifyPassword(string hashedPassword, string password);
    }

    public class PasswordHasher : IPasswordHasher
    {
        private const int SaltSize = 16;
        private const int HashSize = 32;
        private const int Iterations = 4;
        private const int MemorySize = 65536; // 64 MB
        private const int DegreeOfParallelism = 2;

        public string HashPassword(string password)
        {
            byte[] salt = RandomNumberGenerator.GetBytes(SaltSize);
            using var argon2 = new Argon2id(Encoding.UTF8.GetBytes(password))
            {
                Salt = salt,
                DegreeOfParallelism = DegreeOfParallelism,
                MemorySize = MemorySize,
                Iterations = Iterations
            };

            byte[] hash = argon2.GetBytes(HashSize);

            // Standard Argon2id representation
            // Format: $argon2id$v=19$m=65536,t=4,p=2$saltBase64$hashBase64
            string saltBase64 = Convert.ToBase64String(salt);
            string hashBase64 = Convert.ToBase64String(hash);
            return $"$argon2id$v=19$m={MemorySize},t={Iterations},p={DegreeOfParallelism}${saltBase64}${hashBase64}";
        }

        public bool VerifyPassword(string hashedPassword, string password)
        {
            try
            {
                var parts = hashedPassword.Split('$');
                if (parts.Length != 6 || parts[1] != "argon2id")
                {
                    return false;
                }

                // Parse parameters
                var paramParts = parts[3].Split(',');
                int memorySize = MemorySize;
                int iterations = Iterations;
                int parallelism = DegreeOfParallelism;

                foreach (var param in paramParts)
                {
                    var kv = param.Split('=');
                    if (kv.Length == 2)
                    {
                        if (kv[0] == "m") memorySize = int.Parse(kv[1]);
                        if (kv[0] == "t") iterations = int.Parse(kv[1]);
                        if (kv[0] == "p") parallelism = int.Parse(kv[1]);
                    }
                }

                byte[] salt = Convert.FromBase64String(parts[4]);
                byte[] expectedHash = Convert.FromBase64String(parts[5]);

                using var argon2 = new Argon2id(Encoding.UTF8.GetBytes(password))
                {
                    Salt = salt,
                    DegreeOfParallelism = parallelism,
                    MemorySize = memorySize,
                    Iterations = iterations
                };

                byte[] actualHash = argon2.GetBytes(expectedHash.Length);

                return CryptographicOperations.FixedTimeEquals(expectedHash, actualHash);
            }
            catch
            {
                return false;
            }
        }
    }
}
