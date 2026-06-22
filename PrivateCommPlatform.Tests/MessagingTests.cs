using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using PrivateCommPlatform.Api.Data;
using PrivateCommPlatform.Api.Hubs;
using PrivateCommPlatform.Api.Models.Entities;
using PrivateCommPlatform.Api.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Tests
{
    // =========================================================================
    // LIGHTWEIGHT SIGNALR MOCKS
    // =========================================================================
    public class MockHubContext : IHubContext<ChatHub>
    {
        public IHubClients Clients { get; } = new MockHubClients();
        public IGroupManager Groups { get; } = new MockGroupManager();
    }

    public class MockHubClients : IHubClients
    {
        public IClientProxy All => new MockClientProxy();
        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => new MockClientProxy();
        public IClientProxy Client(string connectionId) => new MockClientProxy();
        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => new MockClientProxy();
        public IClientProxy Group(string groupName) => new MockClientProxy();
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => new MockClientProxy();
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => new MockClientProxy();
        public IClientProxy User(string userId) => new MockClientProxy();
        public IClientProxy Users(IReadOnlyList<string> userIds) => new MockClientProxy();
    }

    public class MockClientProxy : IClientProxy
    {
        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }
    }

    public class MockGroupManager : IGroupManager
    {
        public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }
    }

    // =========================================================================
    // MESSAGING UNIT TESTS
    // =========================================================================
    [TestClass]
    public class MessagingTests
    {
        private ApplicationDbContext GetInMemoryDbContext()
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options;
            return new ApplicationDbContext(options);
        }

        [TestMethod]
        public async Task SendMessage_Should_Succeed_If_Sender_Is_Member()
        {
            // Arrange
            var context = GetInMemoryDbContext();
            var hubContext = new MockHubContext();
            var messageService = new MessageService(context, hubContext);

            var user = new User { Id = Guid.NewGuid(), Username = "alice", DisplayName = "Alice" };
            context.Users.Add(user);

            var conversation = new Conversation { Id = Guid.NewGuid(), Type = "DirectMessage" };
            context.Conversations.Add(conversation);

            var member = new ConversationMember { ConversationId = conversation.Id, UserId = user.Id, Role = "Member" };
            context.ConversationMembers.Add(member);

            await context.SaveChangesAsync();

            // Act
            var message = await messageService.SendMessageAsync(user.Id, conversation.Id, "Hello World!");

            // Assert
            Assert.IsNotNull(message);
            Assert.AreEqual("Hello World!", message.Content);
            Assert.AreEqual(user.Id, message.SenderId);
            Assert.AreEqual(conversation.Id, message.ConversationId);

            var savedMessage = await context.Messages.FindAsync(message.Id);
            Assert.IsNotNull(savedMessage);
            Assert.AreEqual("Hello World!", savedMessage.Content);
        }

        [TestMethod]
        public async Task SendMessage_Should_Fail_If_Sender_Is_Not_Member()
        {
            // Arrange
            var context = GetInMemoryDbContext();
            var hubContext = new MockHubContext();
            var messageService = new MessageService(context, hubContext);

            var user = new User { Id = Guid.NewGuid(), Username = "alice", DisplayName = "Alice" };
            context.Users.Add(user);

            var conversation = new Conversation { Id = Guid.NewGuid(), Type = "DirectMessage" };
            context.Conversations.Add(conversation);

            await context.SaveChangesAsync();

            // Act & Assert
            bool threw = false;
            try
            {
                await messageService.SendMessageAsync(user.Id, conversation.Id, "Intruder message!");
            }
            catch (UnauthorizedAccessException)
            {
                threw = true;
            }
            Assert.IsTrue(threw, "Should throw UnauthorizedAccessException");
        }

        [TestMethod]
        public async Task EditMessage_Should_Succeed_Within_GracePeriod()
        {
            // Arrange
            var context = GetInMemoryDbContext();
            var hubContext = new MockHubContext();
            var messageService = new MessageService(context, hubContext);

            var user = new User { Id = Guid.NewGuid(), Username = "alice", DisplayName = "Alice" };
            context.Users.Add(user);

            var conversation = new Conversation { Id = Guid.NewGuid(), Type = "DirectMessage" };
            context.Conversations.Add(conversation);

            var member = new ConversationMember { ConversationId = conversation.Id, UserId = user.Id, Role = "Member" };
            context.ConversationMembers.Add(member);

            var message = new Message
            {
                Id = Guid.NewGuid(),
                ConversationId = conversation.Id,
                SenderId = user.Id,
                Content = "Original Message",
                CreatedDate = DateTimeOffset.UtcNow // Just created
            };
            context.Messages.Add(message);

            await context.SaveChangesAsync();

            // Act
            var edited = await messageService.EditMessageAsync(user.Id, message.Id, "Edited Message Content");

            // Assert
            Assert.IsTrue(edited.IsEdited);
            Assert.AreEqual("Edited Message Content", edited.Content);

            var editAuditLog = await context.MessageEdits.FirstOrDefaultAsync(e => e.MessageId == message.Id);
            Assert.IsNotNull(editAuditLog);
            Assert.AreEqual("Original Message", editAuditLog.OriginalContent);
        }

        [TestMethod]
        public async Task EditMessage_Should_Fail_After_GracePeriod()
        {
            // Arrange
            var context = GetInMemoryDbContext();
            var hubContext = new MockHubContext();
            var messageService = new MessageService(context, hubContext);

            var user = new User { Id = Guid.NewGuid(), Username = "alice", DisplayName = "Alice" };
            context.Users.Add(user);

            var conversation = new Conversation { Id = Guid.NewGuid(), Type = "DirectMessage" };
            context.Conversations.Add(conversation);

            var member = new ConversationMember { ConversationId = conversation.Id, UserId = user.Id, Role = "Member" };
            context.ConversationMembers.Add(member);

            var message = new Message
            {
                Id = Guid.NewGuid(),
                ConversationId = conversation.Id,
                SenderId = user.Id,
                Content = "Old Message",
                CreatedDate = DateTimeOffset.UtcNow.AddMinutes(-20) // Created 20 minutes ago (exceeds 15 mins)
            };
            context.Messages.Add(message);

            await context.SaveChangesAsync();

            // Act & Assert
            bool threw = false;
            try
            {
                await messageService.EditMessageAsync(user.Id, message.Id, "Belated Edit Attempt");
            }
            catch (InvalidOperationException)
            {
                threw = true;
            }
            Assert.IsTrue(threw, "Should throw InvalidOperationException");
        }

        [TestMethod]
        public async Task AddReaction_Should_Prevent_Duplicate_Reactions()
        {
            // Arrange
            var context = GetInMemoryDbContext();
            var hubContext = new MockHubContext();
            var messageService = new MessageService(context, hubContext);

            var user = new User { Id = Guid.NewGuid(), Username = "alice", DisplayName = "Alice" };
            context.Users.Add(user);

            var conversation = new Conversation { Id = Guid.NewGuid(), Type = "DirectMessage" };
            context.Conversations.Add(conversation);

            var member = new ConversationMember { ConversationId = conversation.Id, UserId = user.Id, Role = "Member" };
            context.ConversationMembers.Add(member);

            var message = new Message
            {
                Id = Guid.NewGuid(),
                ConversationId = conversation.Id,
                SenderId = user.Id,
                Content = "React to me"
            };
            context.Messages.Add(message);

            await context.SaveChangesAsync();

            // Act
            await messageService.AddReactionAsync(user.Id, message.Id, "👍");

            // Assert reaction added
            var reactionsCount = await context.Reactions.CountAsync(r => r.MessageId == message.Id && r.UserId == user.Id && r.Emoji == "👍");
            Assert.AreEqual(1, reactionsCount);

            // Attempt duplicate reaction - should throw InvalidOperationException
            bool threw = false;
            try
            {
                await messageService.AddReactionAsync(user.Id, message.Id, "👍");
            }
            catch (InvalidOperationException)
            {
                threw = true;
            }
            Assert.IsTrue(threw, "Should throw InvalidOperationException on duplicate reaction");
        }

        [TestMethod]
        public async Task AddReaction_Should_Reject_Invalid_Emoji()
        {
            // Arrange
            var context = GetInMemoryDbContext();
            var hubContext = new MockHubContext();
            var messageService = new MessageService(context, hubContext);

            var user = new User { Id = Guid.NewGuid(), Username = "alice", DisplayName = "Alice" };
            context.Users.Add(user);

            var conversation = new Conversation { Id = Guid.NewGuid(), Type = "DirectMessage" };
            context.Conversations.Add(conversation);

            var member = new ConversationMember { ConversationId = conversation.Id, UserId = user.Id, Role = "Member" };
            context.ConversationMembers.Add(member);

            var message = new Message
            {
                Id = Guid.NewGuid(),
                ConversationId = conversation.Id,
                SenderId = user.Id,
                Content = "React to me"
            };
            context.Messages.Add(message);

            await context.SaveChangesAsync();

            // Act & Assert
            bool threw = false;
            try
            {
                await messageService.AddReactionAsync(user.Id, message.Id, "💩");
            }
            catch (ArgumentException)
            {
                threw = true;
            }
            Assert.IsTrue(threw, "Should throw ArgumentException on invalid emoji");
        }

        [TestMethod]
        public async Task SendMessage_Should_Parse_Mentions_Of_Conversation_Members()
        {
            // Arrange
            var context = GetInMemoryDbContext();
            var hubContext = new MockHubContext();
            var messageService = new MessageService(context, hubContext);

            var sender = new User { Id = Guid.NewGuid(), Username = "alice", NormalizedUsername = "ALICE", DisplayName = "Alice" };
            var recipient = new User { Id = Guid.NewGuid(), Username = "bob", NormalizedUsername = "BOB", DisplayName = "Bob" };
            context.Users.AddRange(sender, recipient);

            var conversation = new Conversation { Id = Guid.NewGuid(), Type = "DirectMessage" };
            context.Conversations.Add(conversation);

            context.ConversationMembers.Add(new ConversationMember { ConversationId = conversation.Id, UserId = sender.Id, Role = "Member" });
            context.ConversationMembers.Add(new ConversationMember { ConversationId = conversation.Id, UserId = recipient.Id, Role = "Member" });

            await context.SaveChangesAsync();

            // Act
            var message = await messageService.SendMessageAsync(sender.Id, conversation.Id, "Hello @bob, check this out!");

            // Assert
            var mentions = await context.Mentions.Where(m => m.MessageId == message.Id).ToListAsync();
            Assert.AreEqual(1, mentions.Count);
            Assert.AreEqual(recipient.Id, mentions[0].UserId);
        }

        [TestMethod]
        public async Task SendMessage_Should_Ignore_Mentions_Of_Non_Members()
        {
            // Arrange
            var context = GetInMemoryDbContext();
            var hubContext = new MockHubContext();
            var messageService = new MessageService(context, hubContext);

            var sender = new User { Id = Guid.NewGuid(), Username = "alice", NormalizedUsername = "ALICE", DisplayName = "Alice" };
            var outsider = new User { Id = Guid.NewGuid(), Username = "charlie", NormalizedUsername = "CHARLIE", DisplayName = "Charlie" };
            context.Users.AddRange(sender, outsider);

            var conversation = new Conversation { Id = Guid.NewGuid(), Type = "DirectMessage" };
            context.Conversations.Add(conversation);

            context.ConversationMembers.Add(new ConversationMember { ConversationId = conversation.Id, UserId = sender.Id, Role = "Member" });

            await context.SaveChangesAsync();

            // Act
            var message = await messageService.SendMessageAsync(sender.Id, conversation.Id, "Hey @charlie, are you there?");

            // Assert
            var mentionsCount = await context.Mentions.CountAsync(m => m.MessageId == message.Id);
            Assert.AreEqual(0, mentionsCount);
        }
    }
}
