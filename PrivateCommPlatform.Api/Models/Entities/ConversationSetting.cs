using System;

namespace PrivateCommPlatform.Api.Models.Entities
{
    public class ConversationSetting
    {
        public Guid ConversationId { get; set; }
        public Conversation Conversation { get; set; } = null!;
        public string PostingRestriction { get; set; } = "AnyMember"; // AnyMember, OnlyOwnersAndManagers, OnlyOwners
        public string MemberAdditionRestriction { get; set; } = "AnyMember"; // AnyMember, OnlyOwnersAndManagers, OnlyOwners
        public string DeleteRestriction { get; set; } = "OwnOrHigher"; // OwnOrHigher, OnlyOwnersAndManagers
        public string EditRestriction { get; set; } = "OnlyOwnersAndManagers"; // OnlyOwnersAndManagers, OnlyOwners
    }
}
