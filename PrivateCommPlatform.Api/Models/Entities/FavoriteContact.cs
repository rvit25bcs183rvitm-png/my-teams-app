using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class FavoriteContact
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid UserId { get; set; }
        public Guid ContactId { get; set; }
        public DateTimeOffset AddedDate { get; set; } = DateTimeOffset.UtcNow;

        public User User { get; set; } = null!;
        public User Contact { get; set; } = null!;
    }
}
