using Microsoft.EntityFrameworkCore;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using PrivateCommPlatform.Api.Data;
using PrivateCommPlatform.Api.Models.Entities;
using PrivateCommPlatform.Api.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Tests
{
    [TestClass]
    public class EnterpriseFeatureTests
    {
        private ApplicationDbContext GetInMemoryDbContext()
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options;
            return new ApplicationDbContext(options);
        }

        [TestMethod]
        public async Task ConversationSettings_StronglyTyped_Default_Initialization()
        {
            // Arrange
            var context = GetInMemoryDbContext();
            var conversation = new Conversation
            {
                Id = Guid.NewGuid(),
                Type = "GroupChat",
                Name = "Engineering Team",
                CreatedById = Guid.NewGuid(),
                CreatedDate = DateTimeOffset.UtcNow
            };

            context.Conversations.Add(conversation);

            var settings = new ConversationSetting
            {
                ConversationId = conversation.Id,
                PostingRestriction = "OnlyOwnersAndManagers",
                MemberAdditionRestriction = "OnlyOwners",
                DeleteRestriction = "OnlyOwnersAndManagers",
                EditRestriction = "OnlyOwners"
            };

            context.ConversationSettings.Add(settings);
            await context.SaveChangesAsync();

            // Act
            var savedSettings = await context.ConversationSettings
                .FirstOrDefaultAsync(s => s.ConversationId == conversation.Id);

            // Assert
            Assert.IsNotNull(savedSettings);
            Assert.AreEqual("OnlyOwnersAndManagers", savedSettings.PostingRestriction);
            Assert.AreEqual("OnlyOwners", savedSettings.MemberAdditionRestriction);
            Assert.AreEqual("OnlyOwnersAndManagers", savedSettings.DeleteRestriction);
            Assert.AreEqual("OnlyOwners", savedSettings.EditRestriction);
        }

        [TestMethod]
        public async Task MessageService_PostingRestrictions_Should_Block_Employees_When_Restricted()
        {
            // Arrange
            var context = GetInMemoryDbContext();
            var hubContext = new MockHubContext();
            var messageService = new MessageService(context, hubContext);

            var ownerUser = new User { Id = Guid.NewGuid(), Username = "alice", DisplayName = "Alice" };
            var employeeUser = new User { Id = Guid.NewGuid(), Username = "bob", DisplayName = "Bob" };
            context.Users.AddRange(ownerUser, employeeUser);

            var conversation = new Conversation { Id = Guid.NewGuid(), Type = "Channel", Name = "Announcements" };
            context.Conversations.Add(conversation);

            // Set restriction: Only Owners and Managers can post
            var settings = new ConversationSetting
            {
                ConversationId = conversation.Id,
                PostingRestriction = "OnlyOwnersAndManagers"
            };
            context.ConversationSettings.Add(settings);

            context.ConversationMembers.Add(new ConversationMember { ConversationId = conversation.Id, UserId = ownerUser.Id, Role = "Owner" });
            context.ConversationMembers.Add(new ConversationMember { ConversationId = conversation.Id, UserId = employeeUser.Id, Role = "Employee" });

            await context.SaveChangesAsync();

            // Act & Assert
            // 1. Owner should succeed
            var msg1 = await messageService.SendMessageAsync(ownerUser.Id, conversation.Id, "Hello Team!");
            Assert.IsNotNull(msg1);

            // 2. Employee should throw UnauthorizedAccessException
            bool threw = false;
            try
            {
                await messageService.SendMessageAsync(employeeUser.Id, conversation.Id, "Hello, can I reply?");
            }
            catch (UnauthorizedAccessException)
            {
                threw = true;
            }
            Assert.IsTrue(threw, "Employee should be blocked from posting in Announcements channel");
        }

        [TestMethod]
        public async Task MessageService_DeleteRestrictions_Should_Block_Employees_From_Deleting_Own_Message_If_Restricted()
        {
            // Arrange
            var context = GetInMemoryDbContext();
            var hubContext = new MockHubContext();
            var messageService = new MessageService(context, hubContext);

            var employee = new User { Id = Guid.NewGuid(), Username = "bob", DisplayName = "Bob" };
            context.Users.Add(employee);

            var conversation = new Conversation { Id = Guid.NewGuid(), Type = "Channel", Name = "Strict Channel" };
            context.Conversations.Add(conversation);

            // Settings: Only Owners and Managers can delete messages (even if it's your own message)
            var settings = new ConversationSetting
            {
                ConversationId = conversation.Id,
                DeleteRestriction = "OnlyOwnersAndManagers"
            };
            context.ConversationSettings.Add(settings);

            context.ConversationMembers.Add(new ConversationMember { ConversationId = conversation.Id, UserId = employee.Id, Role = "Employee" });

            var message = new Message
            {
                Id = Guid.NewGuid(),
                ConversationId = conversation.Id,
                SenderId = employee.Id,
                Content = "Employee message"
            };
            context.Messages.Add(message);
            await context.SaveChangesAsync();

            // Act & Assert
            bool threw = false;
            try
            {
                await messageService.DeleteMessageAsync(employee.Id, message.Id, "Everyone");
            }
            catch (UnauthorizedAccessException)
            {
                threw = true;
            }
            Assert.IsTrue(threw, "Employee should not be allowed to delete messages if DeleteRestriction is OnlyOwnersAndManagers");
        }

        [TestMethod]
        public async Task CallService_HostControls_LockCall_And_TransferHost()
        {
            // Arrange
            var context = GetInMemoryDbContext();
            var presenceService = new MockPresenceService();
            var callService = new CallService(context, presenceService);

            var host = new User { Id = Guid.NewGuid(), Username = "alice", DisplayName = "Alice" };
            var peer = new User { Id = Guid.NewGuid(), Username = "bob", DisplayName = "Bob" };
            context.Users.AddRange(host, peer);
            await context.SaveChangesAsync();

            // Initiate Call
            var call = await callService.InitiateCallAsync(host.Id, peer.Id, "OneToOne", "conn-1");
            await callService.AcceptCallAsync(call.Id, peer.Id, "conn-2");

            // Host sets to host role
            var hostParticipant = await context.CallParticipants
                .FirstOrDefaultAsync(p => p.CallId == call.Id && p.UserId == host.Id);
            Assert.IsNotNull(hostParticipant);
            hostParticipant.Role = "Host";
            await context.SaveChangesAsync();

            // Act & Assert: Lock meeting
            await callService.LockCallSessionAsync(call.Id, true);
            var updatedCall = await callService.GetCallDetailsAsync(call.Id);
            Assert.IsNotNull(updatedCall);
            Assert.IsTrue(updatedCall.IsLocked);

            // Act & Assert: Transfer Host
            await callService.TransferCallHostAsync(call.Id, host.Id, peer.Id);
            var participants = await context.CallParticipants
                .Where(p => p.CallId == call.Id)
                .ToListAsync();

            var oldHost = participants.FirstOrDefault(p => p.UserId == host.Id);
            var newHost = participants.FirstOrDefault(p => p.UserId == peer.Id);

            Assert.IsNotNull(oldHost);
            Assert.IsNotNull(newHost);
            Assert.AreEqual("Receiver", oldHost.Role);
            Assert.AreEqual("Caller", newHost.Role);
        }

        private class MockPresenceService : IPresenceService
        {
            public Dictionary<Guid, string> PresenceStates { get; } = new();

            public Task SetPresenceOverrideAsync(Guid userId, string? status)
            {
                if (status == null)
                {
                    PresenceStates.Remove(userId);
                }
                else
                {
                    PresenceStates[userId] = status;
                }
                return Task.CompletedTask;
            }

            public Task<string> GetPresenceAsync(Guid userId)
            {
                return Task.FromResult(PresenceStates.ContainsKey(userId) ? PresenceStates[userId] : "Offline");
            }

            public Task<Dictionary<Guid, string>> GetAllPresenceAsync()
            {
                return Task.FromResult(PresenceStates);
            }

            public Task RegisterConnectionAsync(Guid userId, string connectionId) => Task.CompletedTask;
            public Task DeregisterConnectionAsync(Guid userId, string connectionId) => Task.CompletedTask;
        }
    }
}
