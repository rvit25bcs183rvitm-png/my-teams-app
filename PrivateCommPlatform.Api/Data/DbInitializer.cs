using Microsoft.EntityFrameworkCore;
using PrivateCommPlatform.Api.Models.Entities;
using PrivateCommPlatform.Api.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Data
{
    public static class DbInitializer
    {
        public static async Task InitializeAsync(ApplicationDbContext context, IPasswordHasher passwordHasher)
        {
            await context.Database.EnsureCreatedAsync();

            // Bootstrap Secure Storage & Document Management Tables and Triggers for SQL Server
            var initSql = @"
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FileRetentionPolicies')
BEGIN
    CREATE TABLE FileRetentionPolicies (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        name NVARCHAR(100) NOT NULL,
        retention_period_days INT NOT NULL CHECK (retention_period_days >= 0),
        action NVARCHAR(50) NOT NULL CHECK (action IN ('Delete', 'Archive')),
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Folders')
BEGIN
    CREATE TABLE Folders (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        name NVARCHAR(255) NOT NULL,
        parent_id UNIQUEIDENTIFIER NULL REFERENCES Folders(id) ON DELETE NO ACTION,
        owner_id UNIQUEIDENTIFIER NOT NULL,
        space_type NVARCHAR(50) NOT NULL CHECK (space_type IN ('Personal', 'Team', 'Family')),
        space_target_id UNIQUEIDENTIFIER NULL,
        is_deleted BIT NOT NULL DEFAULT 0,
        deleted_at DATETIMEOFFSET NULL,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Files')
BEGIN
    CREATE TABLE Files (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        name NVARCHAR(255) NOT NULL,
        folder_id UNIQUEIDENTIFIER NOT NULL REFERENCES Folders(id) ON DELETE NO ACTION,
        owner_id UNIQUEIDENTIFIER NOT NULL,
        space_type NVARCHAR(50) NOT NULL CHECK (space_type IN ('Personal', 'Team', 'Family')),
        space_target_id UNIQUEIDENTIFIER NULL,
        is_deleted BIT NOT NULL DEFAULT 0,
        deleted_at DATETIMEOFFSET NULL,
        retention_policy_id UNIQUEIDENTIFIER NULL REFERENCES FileRetentionPolicies(id) ON DELETE SET NULL,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        current_version_id UNIQUEIDENTIFIER NULL
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FileVersions')
BEGIN
    CREATE TABLE FileVersions (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        file_id UNIQUEIDENTIFIER NOT NULL REFERENCES Files(id) ON DELETE CASCADE,
        version_number INT NOT NULL CHECK (version_number > 0),
        physical_path NVARCHAR(500) NOT NULL,
        hash_value CHAR(64) NOT NULL,
        file_size BIGINT NOT NULL CHECK (file_size >= 0),
        mime_type NVARCHAR(100) NOT NULL,
        uploaded_by UNIQUEIDENTIFIER NOT NULL,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT unique_file_version UNIQUE (file_id, version_number)
    );
    
    IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_Files_FileVersions_current_version_id')
    BEGIN
        ALTER TABLE Files ADD CONSTRAINT FK_Files_FileVersions_current_version_id FOREIGN KEY (current_version_id) REFERENCES FileVersions(id) ON DELETE NO ACTION;
    END;
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FilePermissions')
BEGIN
    CREATE TABLE FilePermissions (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        file_id UNIQUEIDENTIFIER NULL REFERENCES Files(id) ON DELETE CASCADE,
        folder_id UNIQUEIDENTIFIER NULL REFERENCES Folders(id) ON DELETE CASCADE,
        user_id UNIQUEIDENTIFIER NULL,
        role_name NVARCHAR(100) NULL,
        permission_level NVARCHAR(50) NOT NULL CHECK (permission_level IN ('Viewer', 'Editor', 'Owner')),
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT check_permission_target CHECK (
            (file_id IS NOT NULL AND folder_id IS NULL) OR 
            (file_id IS NULL AND folder_id IS NOT NULL)
        )
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FileShares')
BEGIN
    CREATE TABLE FileShares (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        shared_by UNIQUEIDENTIFIER NOT NULL,
        recipient_type NVARCHAR(50) NOT NULL CHECK (recipient_type IN ('User', 'Team', 'Group')),
        recipient_id UNIQUEIDENTIFIER NOT NULL,
        file_id UNIQUEIDENTIFIER NULL REFERENCES Files(id) ON DELETE CASCADE,
        folder_id UNIQUEIDENTIFIER NULL REFERENCES Folders(id) ON DELETE CASCADE,
        permission_level NVARCHAR(50) NOT NULL CHECK (permission_level IN ('Viewer', 'Editor', 'Owner')),
        share_link_token NVARCHAR(255) NULL UNIQUE,
        expires_at DATETIMEOFFSET NULL,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT check_share_target CHECK (
            (file_id IS NOT NULL AND folder_id IS NULL) OR 
            (file_id IS NULL AND folder_id IS NOT NULL)
        )
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FileTags')
BEGIN
    CREATE TABLE FileTags (
        file_id UNIQUEIDENTIFIER NOT NULL REFERENCES Files(id) ON DELETE CASCADE,
        tag NVARCHAR(100) NOT NULL,
        PRIMARY KEY (file_id, tag)
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FileAuditLogs')
BEGIN
    CREATE TABLE FileAuditLogs (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        actor_id UNIQUEIDENTIFIER NOT NULL,
        action NVARCHAR(100) NOT NULL CHECK (action IN (
            'Upload', 'Download', 'Delete', 'Restore', 'Share', 'PermissionChange', 'VersionRestore'
        )),
        file_id UNIQUEIDENTIFIER NULL,
        folder_id UNIQUEIDENTIFIER NULL,
        version_id UNIQUEIDENTIFIER NULL,
        ip_address NVARCHAR(50) NOT NULL,
        user_agent NVARCHAR(500) NULL,
        details NVARCHAR(MAX) NOT NULL CHECK (ISJSON(details) = 1),
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    );
END;

IF NOT EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_protect_file_audit_logs')
BEGIN
    EXEC('
    CREATE TRIGGER trg_protect_file_audit_logs 
    ON FileAuditLogs
    INSTEAD OF UPDATE, DELETE
    AS
    BEGIN
        THROW 50000, ''FileAuditLogs table is append-only. Modification and deletion of audit trails are prohibited.'', 1;
    END;
    ');
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Calls')
BEGIN
    CREATE TABLE Calls (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        ConversationId UNIQUEIDENTIFIER NULL,
        CallerId UNIQUEIDENTIFIER NOT NULL,
        StartTime DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        EndTime DATETIMEOFFSET NULL,
        Duration INT NULL,
        Status NVARCHAR(50) NOT NULL,
        Type NVARCHAR(50) NOT NULL,
        UserRating INT NULL,
        UserFeedback NVARCHAR(500) NULL,
        IsLocked BIT NOT NULL DEFAULT 0,
        JoinCode NVARCHAR(50) NULL
    );
END;

IF NOT EXISTS(SELECT * FROM sys.columns WHERE Name = N'IsLocked' AND Object_ID = Object_ID(N'Calls'))
BEGIN
    ALTER TABLE Calls ADD IsLocked BIT NOT NULL DEFAULT 0;
END;

IF NOT EXISTS(SELECT * FROM sys.columns WHERE Name = N'MeetingId' AND Object_ID = Object_ID(N'Calls'))
BEGIN
    ALTER TABLE Calls ADD MeetingId UNIQUEIDENTIFIER NULL;
END;

IF NOT EXISTS(SELECT * FROM sys.columns WHERE Name = N'JoinCode' AND Object_ID = Object_ID(N'Calls'))
BEGIN
    ALTER TABLE Calls ADD JoinCode NVARCHAR(50) NULL;
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Meetings')
BEGIN
    CREATE TABLE Meetings (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        Title NVARCHAR(200) NOT NULL,
        Description NVARCHAR(1000) NULL,
        OrganizerId UNIQUEIDENTIFIER NOT NULL,
        ConversationId UNIQUEIDENTIFIER NULL,
        MeetingCode NVARCHAR(20) NOT NULL UNIQUE,
        ScheduledStart DATETIMEOFFSET NULL,
        ScheduledEnd DATETIMEOFFSET NULL,
        ActualStart DATETIMEOFFSET NULL,
        ActualEnd DATETIMEOFFSET NULL,
        MaxParticipants INT NOT NULL DEFAULT 20,
        IsLocked BIT NOT NULL DEFAULT 0,
        WaitingRoom BIT NOT NULL DEFAULT 0,
        CreatedAt DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CallQualityMetrics')
BEGIN
    CREATE TABLE CallQualityMetrics (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        CallId UNIQUEIDENTIFIER NOT NULL REFERENCES Calls(Id) ON DELETE CASCADE,
        UserId UNIQUEIDENTIFIER NOT NULL,
        PacketLoss DECIMAL(5,2) NULL,
        Jitter DECIMAL(10,2) NULL,
        RTT INT NULL,
        Latency INT NULL,
        Bitrate INT NULL,
        Resolution NVARCHAR(20) NULL,
        FrameRate INT NULL,
        IceType NVARCHAR(20) NULL,
        RecordedAt DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CallParticipants')
BEGIN
    CREATE TABLE CallParticipants (
        CallId UNIQUEIDENTIFIER NOT NULL REFERENCES Calls(Id) ON DELETE CASCADE,
        UserId UNIQUEIDENTIFIER NOT NULL,
        JoinedTime DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        LeftTime DATETIMEOFFSET NULL,
        Role NVARCHAR(50) NOT NULL,
        Status NVARCHAR(50) NOT NULL,
        PRIMARY KEY (CallId, UserId)
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'UserBlocks')
BEGIN
    CREATE TABLE UserBlocks (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        BlockerId UNIQUEIDENTIFIER NOT NULL REFERENCES Users(Id) ON DELETE CASCADE,
        BlockedId UNIQUEIDENTIFIER NOT NULL REFERENCES Users(Id) ON DELETE NO ACTION,
        CreatedDate DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    );
    CREATE UNIQUE INDEX IX_UserBlocks_BlockerId_BlockedId ON UserBlocks (BlockerId, BlockedId);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FavoriteContacts')
BEGIN
    CREATE TABLE FavoriteContacts (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        UserId UNIQUEIDENTIFIER NOT NULL REFERENCES Users(Id) ON DELETE CASCADE,
        ContactId UNIQUEIDENTIFIER NOT NULL REFERENCES Users(Id) ON DELETE NO ACTION,
        AddedDate DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    );
    CREATE UNIQUE INDEX IX_FavoriteContacts_UserId_ContactId ON FavoriteContacts (UserId, ContactId);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CallInvitations')
BEGIN
    CREATE TABLE CallInvitations (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        CallId UNIQUEIDENTIFIER NOT NULL REFERENCES Calls(Id) ON DELETE CASCADE,
        InviterId UNIQUEIDENTIFIER NOT NULL,
        InviteeId UNIQUEIDENTIFIER NOT NULL,
        Status NVARCHAR(50) NOT NULL,
        SentTime DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        RespondedTime DATETIMEOFFSET NULL
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CallEvents')
BEGIN
    CREATE TABLE CallEvents (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        CallId UNIQUEIDENTIFIER NOT NULL REFERENCES Calls(Id) ON DELETE CASCADE,
        UserId UNIQUEIDENTIFIER NULL REFERENCES Users(Id) ON DELETE SET NULL,
        EventType NVARCHAR(100) NOT NULL,
        Timestamp DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        Details NVARCHAR(1000) NOT NULL
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CallDevices')
BEGIN
    CREATE TABLE CallDevices (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        CallId UNIQUEIDENTIFIER NOT NULL REFERENCES Calls(Id) ON DELETE CASCADE,
        UserId UNIQUEIDENTIFIER NOT NULL,
        ConnectionId NVARCHAR(200) NOT NULL,
        DeviceName NVARCHAR(200) NOT NULL,
        DeviceType NVARCHAR(100) NOT NULL,
        JoinedTime DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        Status NVARCHAR(50) NOT NULL
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CallStatistics')
BEGIN
    CREATE TABLE CallStatistics (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        CallId UNIQUEIDENTIFIER NOT NULL REFERENCES Calls(Id) ON DELETE CASCADE,
        UserId UNIQUEIDENTIFIER NOT NULL,
        PacketsSent BIGINT NOT NULL,
        PacketsReceived BIGINT NOT NULL,
        BytesSent BIGINT NOT NULL,
        BytesReceived BIGINT NOT NULL,
        JitterMs FLOAT NOT NULL,
        PacketLossRate FLOAT NOT NULL,
        RttMs FLOAT NOT NULL,
        BitrateBps FLOAT NOT NULL,
        Timestamp DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    );
END;

DROP TABLE IF EXISTS CallAuditLogs;
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CallAuditLogs')
BEGIN
    CREATE TABLE CallAuditLogs (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        CallId UNIQUEIDENTIFIER NOT NULL REFERENCES Calls(Id) ON DELETE NO ACTION,
        ActorId UNIQUEIDENTIFIER NOT NULL REFERENCES Users(Id) ON DELETE NO ACTION,
        Action NVARCHAR(100) NOT NULL,
        Timestamp DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        IpAddress NVARCHAR(50) NOT NULL,
        Details NVARCHAR(1000) NOT NULL
    );
END;

IF NOT EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_protect_call_audit_logs')
BEGIN
    EXEC('
    CREATE TRIGGER trg_protect_call_audit_logs 
    ON CallAuditLogs
    INSTEAD OF UPDATE, DELETE
    AS
    BEGIN
        THROW 50000, ''CallAuditLogs table is append-only. Modification and deletion of audit trails are prohibited.'', 1;
    END;
    ');
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ConversationSettings')
BEGIN
    CREATE TABLE ConversationSettings (
        ConversationId UNIQUEIDENTIFIER PRIMARY KEY REFERENCES Conversations(Id) ON DELETE CASCADE,
        PostingRestriction NVARCHAR(100) NOT NULL DEFAULT 'AnyMember',
        MemberAdditionRestriction NVARCHAR(100) NOT NULL DEFAULT 'AnyMember',
        DeleteRestriction NVARCHAR(100) NOT NULL DEFAULT 'OwnOrHigher',
        EditRestriction NVARCHAR(100) NOT NULL DEFAULT 'OnlyOwnersAndManagers'
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'GroupAuditLogs')
BEGIN
    CREATE TABLE GroupAuditLogs (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        ConversationId UNIQUEIDENTIFIER NOT NULL,
        ActorId UNIQUEIDENTIFIER NOT NULL,
        EventType NVARCHAR(100) NOT NULL,
        Details NVARCHAR(MAX) NOT NULL,
        Timestamp DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    );
END;

IF NOT EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_protect_group_audit_logs')
BEGIN
    EXEC('
    CREATE TRIGGER trg_protect_group_audit_logs 
    ON GroupAuditLogs
    INSTEAD OF UPDATE, DELETE
    AS
    BEGIN
        THROW 50000, ''GroupAuditLogs table is append-only. Modification and deletion of audit trails are prohibited.'', 1;
    END;
    ');
END;

IF NOT EXISTS(SELECT * FROM sys.columns WHERE Name = N'ParentId' AND Object_ID = Object_ID(N'Conversations'))
BEGIN
    ALTER TABLE Conversations ADD ParentId UNIQUEIDENTIFIER NULL REFERENCES Conversations(Id) ON DELETE NO ACTION;
END;
";
            await context.Database.ExecuteSqlRawAsync(initSql);

            // Seed standard retention policies if none exist
            if (!await context.FileRetentionPolicies.AnyAsync())
            {
                context.FileRetentionPolicies.AddRange(
                    new FileRetentionPolicy { Id = Guid.NewGuid(), Name = "Standard 1-Year Retention", RetentionPeriodDays = 365, Action = "Archive" },
                    new FileRetentionPolicy { Id = Guid.NewGuid(), Name = "Confidential 7-Year Retention", RetentionPeriodDays = 2555, Action = "Archive" },
                    new FileRetentionPolicy { Id = Guid.NewGuid(), Name = "Temporary 30-Day Retention", RetentionPeriodDays = 30, Action = "Delete" }
                );
                await context.SaveChangesAsync();
            }

            var permissions = new List<Permission>
            {
                new() { Name = "platform:all", Description = "Full platform control" },
                new() { Name = "admin:create", Description = "Create administrators" },
                new() { Name = "admin:delete", Description = "Delete administrators" },
                new() { Name = "user:all", Description = "Manage all users" },
                new() { Name = "security:read", Description = "View security and audit logs" },
                new() { Name = "platform:settings", Description = "Configure platform settings" },
                new() { Name = "storage:manage", Description = "Manage storage policies" },
                new() { Name = "user:create", Description = "Create users" },
                new() { Name = "user:disable", Description = "Disable users" },
                new() { Name = "user:resetpassword", Description = "Reset user passwords" },
                new() { Name = "role:assign", Description = "Assign roles to users" },
                new() { Name = "team:create", Description = "Create teams" },
                new() { Name = "channel:manage", Description = "Manage channels" },
                new() { Name = "team:manage", Description = "Manage assigned teams" },
                new() { Name = "team:view", Description = "View team members" },
                new() { Name = "workspace:create", Description = "Create workspaces" },
                new() { Name = "platform:use", Description = "Use platform features" },
                new() { Name = "team:participate", Description = "Participate in teams" },
                new() { Name = "messaging:use", Description = "Messaging capabilities" },
                new() { Name = "calling:use", Description = "Calling capabilities" },
                new() { Name = "filesharing:use", Description = "File sharing capabilities" },
                new() { Name = "meeting:participate", Description = "Meeting participation" },
                new() { Name = "platform:guest_access", Description = "Restricted guest access" }
            };

            foreach (var perm in permissions)
            {
                if (!await context.Permissions.AnyAsync(p => p.Name == perm.Name))
                {
                    context.Permissions.Add(perm);
                }
            }
            await context.SaveChangesAsync();

            var rolesAndPermissions = new Dictionary<string, (string Desc, string[] Perms)>
            {
                ["Super Administrator"] = (
                    "Full platform control and management.",
                    new[] { "platform:all", "admin:create", "admin:delete", "user:all", "security:read", "platform:settings", "storage:manage" }
                ),
                ["Administrator"] = (
                    "User management and basic configurations.",
                    new[] { "user:create", "user:disable", "user:resetpassword", "role:assign", "team:create", "channel:manage" }
                ),
                ["Manager"] = (
                    "Team management and workspaces.",
                    new[] { "team:manage", "team:view", "workspace:create" }
                ),
                ["Employee"] = (
                    "Platform participant for employees.",
                    new[] { "platform:use", "team:participate" }
                ),
                ["Family Member"] = (
                    "Platform participant for family members.",
                    new[] { "messaging:use", "calling:use", "filesharing:use", "meeting:participate" }
                ),
                ["Guest"] = (
                    "Restricted temporary or outside user.",
                    new[] { "platform:guest_access" }
                )
            };

            foreach (var rp in rolesAndPermissions)
            {
                var roleName = rp.Key;
                var desc = rp.Value.Desc;
                var perms = rp.Value.Perms;

                var role = await context.Roles.Include(r => r.RolePermissions).FirstOrDefaultAsync(r => r.Name == roleName);
                if (role == null)
                {
                    role = new Role { Id = Guid.NewGuid(), Name = roleName, Description = desc };
                    context.Roles.Add(role);
                    await context.SaveChangesAsync();
                }

                var dbPerms = await context.Permissions.Where(p => perms.Contains(p.Name)).ToListAsync();
                foreach (var perm in dbPerms)
                {
                    if (!role.RolePermissions.Any(x => x.PermissionId == perm.Id))
                    {
                        role.RolePermissions.Add(new RolePermission { RoleId = role.Id, PermissionId = perm.Id });
                    }
                }
            }
            await context.SaveChangesAsync();

            var superAdminRole = await context.Roles.FirstAsync(r => r.Name == "Super Administrator");
            var adminUsername = "admin";
            var normalizedUsername = adminUsername.ToUpperInvariant();

            if (!await context.Users.AnyAsync(u => u.NormalizedUsername == normalizedUsername))
            {
                var tempPassword = "AdminPassword123!";
                var passwordHash = passwordHasher.HashPassword(tempPassword);
                Console.WriteLine($"[DEBUG] Hashing password for admin user. Hash length: {passwordHash?.Length ?? 0}");

                var superAdmin = new User
                {
                    Id = Guid.NewGuid(),
                    Username = adminUsername,
                    NormalizedUsername = normalizedUsername,
                    DisplayName = "Super Administrator",
                    FirstName = "System",
                    LastName = "Administrator",
                    Email = "admin@platform.local",
                    PasswordHash = passwordHash!,
                    AccountStatus = "PendingFirstLogin",
                    IsTemporaryPassword = true,
                    CreatedDate = DateTimeOffset.UtcNow
                };

                superAdmin.UserRoles.Add(new UserRole { User = superAdmin, Role = superAdminRole });

                context.Users.Add(superAdmin);
                await context.SaveChangesAsync();

                Console.WriteLine("==================================================");
                Console.WriteLine("BOOTSTRAP: Created default Super Administrator account.");
                Console.WriteLine($"Username: {adminUsername}");
                Console.WriteLine($"Temporary Password: {tempPassword}");
                Console.WriteLine("IMPORTANT: You must log in and change this password on first login.");
                Console.WriteLine("==================================================");
            }

            // Create Test Users
            var testUsers = new[] {
                new { username = "john.smith", displayName = "John Smith", email = "john@team.local", department = "Engineering" },
                new { username = "sarah.jones", displayName = "Sarah Jones", email = "sarah@team.local", department = "Marketing" },
                new { username = "mike.wilson", displayName = "Mike Wilson", email = "mike@team.local", department = "Sales" },
                new { username = "lisa.brown", displayName = "Lisa Brown", email = "lisa@team.local", department = "Engineering" },
                new { username = "david.lee", displayName = "David Lee", email = "david@team.local", department = "Operations" }
            };

            var testPassword = "TestPassword123!";
            var testPasswordHash = passwordHasher.HashPassword(testPassword);
            
            var userRole = await context.Roles.FirstOrDefaultAsync(r => r.Name == "Employee");
            if (userRole == null)
            {
                Console.WriteLine("[ERROR] Employee role not found. Test users will not be created.");
            }
            else
            {
                var createdUsers = new List<User>();

                foreach (var testUser in testUsers)
                {
                    var normalizedTestUsername = testUser.username.ToUpperInvariant();
                    if (!await context.Users.AnyAsync(u => u.NormalizedUsername == normalizedTestUsername))
                    {
                        var user = new User
                        {
                            Id = Guid.NewGuid(),
                            Username = testUser.username,
                            NormalizedUsername = normalizedTestUsername,
                            DisplayName = testUser.displayName,
                            FirstName = testUser.displayName.Split(' ')[0],
                            LastName = testUser.displayName.Split(' ')[1],
                            Email = testUser.email,
                            PasswordHash = testPasswordHash,
                            AccountStatus = "Active",
                            IsTemporaryPassword = false,
                            Department = testUser.department,
                            CreatedDate = DateTimeOffset.UtcNow
                        };
                        user.UserRoles.Add(new UserRole { User = user, Role = userRole });
                        context.Users.Add(user);
                        createdUsers.Add(user);
                    }
                }

                if (createdUsers.Count > 0)
                {
                    await context.SaveChangesAsync();

                    Console.WriteLine("==================================================");
                    Console.WriteLine("BOOTSTRAP: Created test user accounts.");
                    Console.WriteLine($"Test Password: {testPassword}");
                    Console.WriteLine("Test Users:");
                    foreach (var testUser in testUsers)
                    {
                        Console.WriteLine($"  - Username: {testUser.username} | Display Name: {testUser.displayName}");
                    }
                    Console.WriteLine("==================================================");
                }
            }

            // Create user tt with password 123
            var ttUsername = "tt";
            var ttNormalized = ttUsername.ToUpperInvariant();
            if (!await context.Users.AnyAsync(u => u.NormalizedUsername == ttNormalized))
            {
                var ttPasswordHash = passwordHasher.HashPassword("123");
                var ttUser = new User
                {
                    Id = Guid.NewGuid(),
                    Username = ttUsername,
                    NormalizedUsername = ttNormalized,
                    DisplayName = "TT User",
                    FirstName = "TT",
                    LastName = "User",
                    Email = "tt@platform.local",
                    PasswordHash = ttPasswordHash,
                    AccountStatus = "Active",
                    IsTemporaryPassword = false,
                    CreatedDate = DateTimeOffset.UtcNow
                };
                
                var employeeRole = await context.Roles.FirstOrDefaultAsync(r => r.Name == "Employee");
                if (employeeRole != null)
                {
                    ttUser.UserRoles.Add(new UserRole { User = ttUser, Role = employeeRole });
                }
                
                context.Users.Add(ttUser);
                await context.SaveChangesAsync();
                Console.WriteLine("BOOTSTRAP: Created user 'tt' with password '123'.");
            }

            // Create sample channels if they don't exist
            if (!await context.Conversations.AnyAsync(c => c.Type == "Channel"))
            {
                var adminUser = await context.Users.FirstAsync(u => u.NormalizedUsername == "ADMIN");
                var allUsers = await context.Users.ToListAsync();
                var channels = new[]
                {
                    new Conversation { Id = Guid.NewGuid(), Type = "Channel", Name = "general", CreatedById = adminUser.Id },
                    new Conversation { Id = Guid.NewGuid(), Type = "Channel", Name = "announcements", CreatedById = adminUser.Id },
                    new Conversation { Id = Guid.NewGuid(), Type = "Channel", Name = "random", CreatedById = adminUser.Id }
                };

                context.Conversations.AddRange(channels);
                await context.SaveChangesAsync();

                foreach (var channel in channels)
                {
                    context.ConversationSettings.Add(new ConversationSetting
                    {
                        ConversationId = channel.Id,
                        PostingRestriction = channel.Name == "announcements" ? "OnlyOwnersAndManagers" : "AnyMember",
                        MemberAdditionRestriction = "AnyMember",
                        DeleteRestriction = "OwnOrHigher",
                        EditRestriction = "OnlyOwnersAndManagers"
                    });

                    // Add all users to these default channels
                    foreach (var user in allUsers)
                    {
                        context.ConversationMembers.Add(new ConversationMember
                        {
                            ConversationId = channel.Id,
                            UserId = user.Id,
                            Role = user.Id == adminUser.Id ? "Owner" : "Employee",
                            JoinedDate = DateTimeOffset.UtcNow
                        });
                    }
                }
                await context.SaveChangesAsync();

                Console.WriteLine("==================================================");
                Console.WriteLine("BOOTSTRAP: Created sample channels with settings and members.");
                Console.WriteLine("==================================================");
            }
        }
    }
}
