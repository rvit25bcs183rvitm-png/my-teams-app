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
    public class VoiceCallingTests
    {
        private ApplicationDbContext GetInMemoryDbContext()
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options;
            return new ApplicationDbContext(options);
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

        [TestMethod]
        public async Task VerifyCallingEligibility_Should_Block_Calls_When_User_Blocked()
        {
            // Arrange
            var context = GetInMemoryDbContext();
            var presenceService = new MockPresenceService();
            var callService = new CallService(context, presenceService);

            var caller = new User { Id = Guid.NewGuid(), Username = "alice", DisplayName = "Alice" };
            var target = new User { Id = Guid.NewGuid(), Username = "bob", DisplayName = "Bob" };
            context.Users.AddRange(caller, target);

            // Block Bob by Alice
            context.UserBlocks.Add(new UserBlock { BlockerId = caller.Id, BlockedId = target.Id });
            await context.SaveChangesAsync();

            // Act
            var eligibility = await callService.VerifyCallingEligibilityAsync(caller.Id, target.Id);

            // Assert
            Assert.IsFalse(eligibility.IsEligible);
            Assert.AreEqual("Call blocked by user settings.", eligibility.Reason);
        }

        [TestMethod]
        public async Task VerifyCallingEligibility_Should_Prevent_Employee_Calling_Admin_Directly()
        {
            // Arrange
            var context = GetInMemoryDbContext();
            var presenceService = new MockPresenceService();
            var callService = new CallService(context, presenceService);

            var caller = new User { Id = Guid.NewGuid(), Username = "employee1", DisplayName = "Employee One" };
            var admin = new User { Id = Guid.NewGuid(), Username = "admin1", DisplayName = "Admin One" };
            context.Users.AddRange(caller, admin);

            var employeeRole = new Role { Id = Guid.NewGuid(), Name = "Employee" };
            var adminRole = new Role { Id = Guid.NewGuid(), Name = "Administrator" };
            context.Roles.AddRange(employeeRole, adminRole);

            context.UserRoles.Add(new UserRole { UserId = caller.Id, RoleId = employeeRole.Id });
            context.UserRoles.Add(new UserRole { UserId = admin.Id, RoleId = adminRole.Id });

            await context.SaveChangesAsync();

            // Act
            var eligibility = await callService.VerifyCallingEligibilityAsync(caller.Id, admin.Id);

            // Assert
            Assert.IsFalse(eligibility.IsEligible);
            Assert.IsTrue(eligibility.Reason.Contains("Restricted Calling"));
        }

        [TestMethod]
        public async Task InitiateCall_Should_Succeed_If_Caller_Online()
        {
            // Arrange
            var context = GetInMemoryDbContext();
            var presenceService = new MockPresenceService();
            var callService = new CallService(context, presenceService);

            var caller = new User { Id = Guid.NewGuid(), Username = "alice", DisplayName = "Alice" };
            var target = new User { Id = Guid.NewGuid(), Username = "bob", DisplayName = "Bob" };
            context.Users.AddRange(caller, target);
            await context.SaveChangesAsync();

            // Act
            var call = await callService.InitiateCallAsync(caller.Id, target.Id, "OneToOne", "conn-id");

            // Assert
            Assert.IsNotNull(call);
            Assert.AreEqual("Ringing", call.Status);
            Assert.AreEqual(caller.Id, call.CallerId);

            // Check presence updated
            var callerPresence = await presenceService.GetPresenceAsync(caller.Id);
            var targetPresence = await presenceService.GetPresenceAsync(target.Id);
            Assert.AreEqual("Calling", callerPresence);
            Assert.AreEqual("Offline", targetPresence);
        }

        [TestMethod]
        public async Task AcceptCall_Should_Transition_CallState_And_Presence()
        {
            // Arrange
            var context = GetInMemoryDbContext();
            var presenceService = new MockPresenceService();
            var callService = new CallService(context, presenceService);

            var caller = new User { Id = Guid.NewGuid(), Username = "alice", DisplayName = "Alice" };
            var target = new User { Id = Guid.NewGuid(), Username = "bob", DisplayName = "Bob" };
            context.Users.AddRange(caller, target);
            await context.SaveChangesAsync();

            var call = await callService.InitiateCallAsync(caller.Id, target.Id, "OneToOne", "conn-id-caller");

            // Act
            var acceptedCall = await callService.AcceptCallAsync(call.Id, target.Id, "conn-id-target");

            // Assert
            Assert.AreEqual("Connected", acceptedCall.Status);
            
            // Check presence updated to In Voice Call
            var callerPresence = await presenceService.GetPresenceAsync(caller.Id);
            var targetPresence = await presenceService.GetPresenceAsync(target.Id);
            Assert.AreEqual("In Voice Call", callerPresence);
            Assert.AreEqual("In Voice Call", targetPresence);
        }

        [TestMethod]
        public async Task RejectCall_Should_Set_Status_And_Release_Presence()
        {
            // Arrange
            var context = GetInMemoryDbContext();
            var presenceService = new MockPresenceService();
            var callService = new CallService(context, presenceService);

            var caller = new User { Id = Guid.NewGuid(), Username = "alice", DisplayName = "Alice" };
            var target = new User { Id = Guid.NewGuid(), Username = "bob", DisplayName = "Bob" };
            context.Users.AddRange(caller, target);
            await context.SaveChangesAsync();

            var call = await callService.InitiateCallAsync(caller.Id, target.Id, "OneToOne", "conn-id-caller");

            // Act
            var rejectedCall = await callService.RejectCallAsync(call.Id, target.Id, "Declined");

            // Assert
            Assert.AreEqual("Rejected", rejectedCall.Status);
            Assert.IsNotNull(rejectedCall.EndTime);

            // Check presence cleared (returns to Default which is Offline in mock)
            var callerPresence = await presenceService.GetPresenceAsync(caller.Id);
            var targetPresence = await presenceService.GetPresenceAsync(target.Id);
            Assert.AreEqual("Offline", callerPresence);
            Assert.AreEqual("Offline", targetPresence);
        }

        [TestMethod]
        public async Task EndCall_Should_Record_Duration_Correctly()
        {
            // Arrange
            var context = GetInMemoryDbContext();
            var presenceService = new MockPresenceService();
            var callService = new CallService(context, presenceService);

            var caller = new User { Id = Guid.NewGuid(), Username = "alice", DisplayName = "Alice" };
            var target = new User { Id = Guid.NewGuid(), Username = "bob", DisplayName = "Bob" };
            context.Users.AddRange(caller, target);
            await context.SaveChangesAsync();

            var call = await callService.InitiateCallAsync(caller.Id, target.Id, "OneToOne", "conn-id-caller");
            await callService.AcceptCallAsync(call.Id, target.Id, "conn-id-target");

            // Artificially subtract time to simulate duration
            call.StartTime = DateTimeOffset.UtcNow.AddSeconds(-45);
            await context.SaveChangesAsync();

            // Act
            var endedCall = await callService.EndCallAsync(call.Id, caller.Id);

            // Assert
            Assert.AreEqual("Completed", endedCall.Status);
            Assert.IsNotNull(endedCall.Duration);
            Assert.IsTrue(endedCall.Duration >= 45);
        }
    }
}
