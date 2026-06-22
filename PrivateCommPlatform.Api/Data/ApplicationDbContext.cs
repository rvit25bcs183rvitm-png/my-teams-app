using Microsoft.EntityFrameworkCore;
using PrivateCommPlatform.Api.Models.Entities;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace PrivateCommPlatform.Api.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        // Foundation
        public DbSet<User> Users { get; set; } = null!;
        public DbSet<Role> Roles { get; set; } = null!;
        public DbSet<Permission> Permissions { get; set; } = null!;
        public DbSet<RolePermission> RolePermissions { get; set; } = null!;
        public DbSet<UserRole> UserRoles { get; set; } = null!;
        public DbSet<Session> Sessions { get; set; } = null!;
        public DbSet<RefreshToken> RefreshTokens { get; set; } = null!;
        public DbSet<PasswordHistory> PasswordHistories { get; set; } = null!;
        public DbSet<AuditLog> AuditLogs { get; set; } = null!;
        public DbSet<SecurityEvent> SecurityEvents { get; set; } = null!;

        // Messaging
        public DbSet<Conversation> Conversations { get; set; } = null!;
        public DbSet<ConversationMember> ConversationMembers { get; set; } = null!;
        public DbSet<ConversationSetting> ConversationSettings { get; set; } = null!;
        public DbSet<GroupAuditLog> GroupAuditLogs { get; set; } = null!;
        public DbSet<Message> Messages { get; set; } = null!;
        public DbSet<Attachment> Attachments { get; set; } = null!;
        public DbSet<Reaction> Reactions { get; set; } = null!;
        public DbSet<ReadReceipt> ReadReceipts { get; set; } = null!;
        public DbSet<DeliveryReceipt> DeliveryReceipts { get; set; } = null!;
        public DbSet<Mention> Mentions { get; set; } = null!;
        public DbSet<MessageEdit> MessageEdits { get; set; } = null!;
        public DbSet<MessageDelete> MessageDeletes { get; set; } = null!;

        // Secure Storage & Document Management
        public DbSet<FileRetentionPolicy> FileRetentionPolicies { get; set; } = null!;
        public DbSet<Folder> Folders { get; set; } = null!;
        public DbSet<FileMetadata> Files { get; set; } = null!;
        public DbSet<FileVersion> FileVersions { get; set; } = null!;
        public DbSet<FilePermission> FilePermissions { get; set; } = null!;
        public DbSet<Models.Entities.FileShare> FileShares { get; set; } = null!;
        public DbSet<FileTag> FileTags { get; set; } = null!;
        public DbSet<FileAuditLog> FileAuditLogs { get; set; } = null!;

        // Voice Calling
        public DbSet<Call> Calls { get; set; } = null!;
        public DbSet<Meeting> Meetings { get; set; } = null!;
        public DbSet<CallQualityMetric> CallQualityMetrics { get; set; } = null!;
        public DbSet<CallParticipant> CallParticipants { get; set; } = null!;
        public DbSet<UserBlock> UserBlocks { get; set; } = null!;
        public DbSet<FavoriteContact> FavoriteContacts { get; set; } = null!;
        public DbSet<CallInvitation> CallInvitations { get; set; } = null!;
        public DbSet<CallEvent> CallEvents { get; set; } = null!;
        public DbSet<CallDevice> CallDevices { get; set; } = null!;
        public DbSet<CallStatistic> CallStatistics { get; set; } = null!;
        public DbSet<CallAuditLog> CallAuditLogs { get; set; } = null!;
        public DbSet<PaymentTransaction> PaymentTransactions { get; set; } = null!;

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // ==========================================
            // FOUNDATION MAPPINGS
            // ==========================================

            modelBuilder.Entity<User>(entity =>
            {
                entity.ToTable("Users");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Username).HasMaxLength(100).IsRequired();
                entity.Property(e => e.NormalizedUsername).HasMaxLength(100).IsRequired();
                entity.Property(e => e.DisplayName).HasMaxLength(200).IsRequired();
                entity.Property(e => e.FirstName).HasMaxLength(100).IsRequired();
                entity.Property(e => e.LastName).HasMaxLength(100).IsRequired();
                entity.Property(e => e.Email).HasMaxLength(256).IsRequired();
                entity.Property(e => e.PhoneNumber).HasMaxLength(50);
                entity.Property(e => e.Department).HasMaxLength(100);
                entity.Property(e => e.Team).HasMaxLength(100);
                entity.Property(e => e.ProfilePhoto);
                entity.Property(e => e.PasswordHash).IsRequired();
                entity.Property(e => e.AccountStatus).HasMaxLength(50).IsRequired();
                entity.Property(e => e.FailedLoginAttempts).HasDefaultValue(0);
                entity.Property(e => e.LockoutEnd);
                entity.Property(e => e.CreatedDate).HasDefaultValueSql("sysdatetimeoffset()");
                entity.Property(e => e.LastLoginDate);
                entity.Property(e => e.LastActivityDate);
                entity.Property(e => e.IsTemporaryPassword).HasDefaultValue(true);

                entity.HasIndex(e => e.NormalizedUsername).IsUnique();
            });

            modelBuilder.Entity<Role>(entity =>
            {
                entity.ToTable("Roles");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Name).HasMaxLength(100).IsRequired();
                entity.Property(e => e.Description).HasMaxLength(500);

                entity.HasIndex(e => e.Name).IsUnique();
            });

            modelBuilder.Entity<Permission>(entity =>
            {
                entity.ToTable("Permissions");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Name).HasMaxLength(100).IsRequired();
                entity.Property(e => e.Description).HasMaxLength(500);

                entity.HasIndex(e => e.Name).IsUnique();
            });

            modelBuilder.Entity<RolePermission>(entity =>
            {
                entity.ToTable("RolePermissions");
                entity.HasKey(e => new { e.RoleId, e.PermissionId });

                entity.HasOne(e => e.Role)
                    .WithMany(r => r.RolePermissions)
                    .HasForeignKey(e => e.RoleId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Permission)
                    .WithMany(p => p.RolePermissions)
                    .HasForeignKey(e => e.PermissionId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<UserRole>(entity =>
            {
                entity.ToTable("UserRoles");
                entity.HasKey(e => new { e.UserId, e.RoleId });

                entity.HasOne(e => e.User)
                    .WithMany(u => u.UserRoles)
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Role)
                    .WithMany(r => r.UserRoles)
                    .HasForeignKey(e => e.RoleId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<Session>(entity =>
            {
                entity.ToTable("Sessions");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.DeviceName).HasMaxLength(200).IsRequired();
                entity.Property(e => e.DeviceType).HasMaxLength(100).IsRequired();
                entity.Property(e => e.IpAddress).HasMaxLength(50).IsRequired();
                entity.Property(e => e.LoginTime).HasDefaultValueSql("sysdatetimeoffset()");
                entity.Property(e => e.LastActivity).HasDefaultValueSql("sysdatetimeoffset()");
                entity.Property(e => e.IsRevoked).HasDefaultValue(false);

                entity.HasOne(e => e.User)
                    .WithMany(u => u.Sessions)
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<RefreshToken>(entity =>
            {
                entity.ToTable("RefreshTokens");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Token).HasMaxLength(256).IsRequired();
                entity.Property(e => e.ExpiryDate).IsRequired();
                entity.Property(e => e.CreatedDate).HasDefaultValueSql("sysdatetimeoffset()");
                entity.Property(e => e.CreatedByIp).HasMaxLength(50).IsRequired();
                entity.Property(e => e.RevokedDate);
                entity.Property(e => e.RevokedByIp).HasMaxLength(50);
                entity.Property(e => e.ReplacedByToken).HasMaxLength(256);

                entity.HasIndex(e => e.Token).IsUnique();

                entity.HasOne(e => e.User)
                    .WithMany(u => u.RefreshTokens)
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.NoAction);

                entity.HasOne(e => e.Session)
                    .WithMany(s => s.RefreshTokens)
                    .HasForeignKey(e => e.SessionId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<PasswordHistory>(entity =>
            {
                entity.ToTable("PasswordHistory");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.PasswordHash).IsRequired();
                entity.Property(e => e.CreatedDate).HasDefaultValueSql("sysdatetimeoffset()");

                entity.HasOne(e => e.User)
                    .WithMany(u => u.PasswordHistories)
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<AuditLog>(entity =>
            {
                entity.ToTable("AuditLogs");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.ActorUsername).HasMaxLength(100).IsRequired();
                entity.Property(e => e.Action).HasMaxLength(100).IsRequired();
                entity.Property(e => e.IpAddress).HasMaxLength(50).IsRequired();
                entity.Property(e => e.UserAgent).HasMaxLength(500);
                entity.Property(e => e.Details).IsRequired();
                entity.Property(e => e.Timestamp).HasDefaultValueSql("sysdatetimeoffset()");
            });

            modelBuilder.Entity<SecurityEvent>(entity =>
            {
                entity.ToTable("SecurityEvents");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.EventType).HasMaxLength(100).IsRequired();
                entity.Property(e => e.IpAddress).HasMaxLength(50).IsRequired();
                entity.Property(e => e.Username).HasMaxLength(100);
                entity.Property(e => e.Details).IsRequired();
                entity.Property(e => e.Timestamp).HasDefaultValueSql("sysdatetimeoffset()");
            });

            // ==========================================
            // MESSAGING MAPPINGS
            // ==========================================

            // Conversations
            modelBuilder.Entity<Conversation>(entity =>
            {
                entity.ToTable("Conversations");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Type).HasMaxLength(50).IsRequired();
                entity.Property(e => e.Name).HasMaxLength(200);
                entity.Property(e => e.CreatedDate).HasDefaultValueSql("sysdatetimeoffset()");
                entity.Property(e => e.IsArchived).HasDefaultValue(false);

                entity.HasOne(e => e.CreatedBy)
                    .WithMany()
                    .HasForeignKey(e => e.CreatedById)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasOne(e => e.Parent)
                    .WithMany(p => p.SubChannels)
                    .HasForeignKey(e => e.ParentId)
                    .OnDelete(DeleteBehavior.NoAction);
            });

            // ConversationSettings
            modelBuilder.Entity<ConversationSetting>(entity =>
            {
                entity.ToTable("ConversationSettings");
                entity.HasKey(e => e.ConversationId);
                entity.Property(e => e.PostingRestriction).HasMaxLength(100).IsRequired().HasDefaultValue("AnyMember");
                entity.Property(e => e.MemberAdditionRestriction).HasMaxLength(100).IsRequired().HasDefaultValue("AnyMember");
                entity.Property(e => e.DeleteRestriction).HasMaxLength(100).IsRequired().HasDefaultValue("OwnOrHigher");
                entity.Property(e => e.EditRestriction).HasMaxLength(100).IsRequired().HasDefaultValue("OnlyOwnersAndManagers");

                entity.HasOne(e => e.Conversation)
                    .WithOne(c => c.Settings)
                    .HasForeignKey<ConversationSetting>(e => e.ConversationId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // GroupAuditLogs
            modelBuilder.Entity<GroupAuditLog>(entity =>
            {
                entity.ToTable("GroupAuditLogs");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.EventType).HasMaxLength(100).IsRequired();
                entity.Property(e => e.Details).IsRequired();
                entity.Property(e => e.Timestamp).HasDefaultValueSql("sysdatetimeoffset()");
            });

            // ConversationMembers
            modelBuilder.Entity<ConversationMember>(entity =>
            {
                entity.ToTable("ConversationMembers");
                entity.HasKey(e => new { e.ConversationId, e.UserId });
                entity.Property(e => e.Role).HasMaxLength(50).IsRequired().HasDefaultValue("Member");
                entity.Property(e => e.JoinedDate).HasDefaultValueSql("sysdatetimeoffset()");

                entity.HasOne(e => e.Conversation)
                    .WithMany(c => c.Members)
                    .HasForeignKey(e => e.ConversationId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Messages
            modelBuilder.Entity<Message>(entity =>
            {
                entity.ToTable("Messages");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Type).HasMaxLength(50).IsRequired().HasDefaultValue("Text");
                entity.Property(e => e.Content).IsRequired();
                entity.Property(e => e.CreatedDate).HasDefaultValueSql("sysdatetimeoffset()");
                entity.Property(e => e.IsEdited).HasDefaultValue(false);
                entity.Property(e => e.IsDeleted).HasDefaultValue(false);

                entity.HasOne(e => e.Conversation)
                    .WithMany(c => c.Messages)
                    .HasForeignKey(e => e.ConversationId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Sender)
                    .WithMany()
                    .HasForeignKey(e => e.SenderId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.ParentMessage)
                    .WithMany()
                    .HasForeignKey(e => e.ParentMessageId)
                    .OnDelete(DeleteBehavior.NoAction);

                entity.HasOne(e => e.ForwardedFromMessage)
                    .WithMany()
                    .HasForeignKey(e => e.ForwardedFromMessageId)
                    .OnDelete(DeleteBehavior.NoAction);
            });

            // Attachments
            modelBuilder.Entity<Attachment>(entity =>
            {
                entity.ToTable("Attachments");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.FileName).HasMaxLength(255).IsRequired();
                entity.Property(e => e.FileType).HasMaxLength(100).IsRequired();
                entity.Property(e => e.FileSize).IsRequired();
                entity.Property(e => e.StoragePath).HasMaxLength(500).IsRequired();
                entity.Property(e => e.CreatedDate).HasDefaultValueSql("sysdatetimeoffset()");

                entity.HasOne(e => e.Message)
                    .WithMany(m => m.Attachments)
                    .HasForeignKey(e => e.MessageId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Reactions
            modelBuilder.Entity<Reaction>(entity =>
            {
                entity.ToTable("Reactions");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Emoji).HasMaxLength(10).IsRequired();
                entity.Property(e => e.CreatedDate).HasDefaultValueSql("sysdatetimeoffset()");

                entity.HasOne(e => e.Message)
                    .WithMany(m => m.Reactions)
                    .HasForeignKey(e => e.MessageId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.NoAction);

                entity.HasIndex(e => new { e.MessageId, e.UserId, e.Emoji }).IsUnique();
            });

            // ReadReceipts
            modelBuilder.Entity<ReadReceipt>(entity =>
            {
                entity.ToTable("ReadReceipts");
                entity.HasKey(e => new { e.MessageId, e.UserId });
                entity.Property(e => e.ReadTime).HasDefaultValueSql("sysdatetimeoffset()");

                entity.HasOne(e => e.Message)
                    .WithMany(m => m.ReadReceipts)
                    .HasForeignKey(e => e.MessageId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.NoAction);
            });

            // DeliveryReceipts
            modelBuilder.Entity<DeliveryReceipt>(entity =>
            {
                entity.ToTable("DeliveryReceipts");
                entity.HasKey(e => new { e.MessageId, e.UserId });
                entity.Property(e => e.DeliveryTime).HasDefaultValueSql("sysdatetimeoffset()");

                entity.HasOne(e => e.Message)
                    .WithMany(m => m.DeliveryReceipts)
                    .HasForeignKey(e => e.MessageId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.NoAction);
            });

            // Mentions
            modelBuilder.Entity<Mention>(entity =>
            {
                entity.ToTable("Mentions");
                entity.HasKey(e => new { e.MessageId, e.UserId });
                entity.Property(e => e.CreatedDate).HasDefaultValueSql("sysdatetimeoffset()");

                entity.HasOne(e => e.Message)
                    .WithMany(m => m.Mentions)
                    .HasForeignKey(e => e.MessageId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.NoAction);
            });

            // MessageEdits
            modelBuilder.Entity<MessageEdit>(entity =>
            {
                entity.ToTable("MessageEdits");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.OriginalContent).IsRequired();
                entity.Property(e => e.EditedDate).HasDefaultValueSql("sysdatetimeoffset()");

                entity.HasOne(e => e.Message)
                    .WithMany(m => m.Edits)
                    .HasForeignKey(e => e.MessageId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // MessageDeletes
            modelBuilder.Entity<MessageDelete>(entity =>
            {
                entity.ToTable("MessageDeletes");
                entity.HasKey(e => e.MessageId);
                entity.Property(e => e.DeletedDate).HasDefaultValueSql("sysdatetimeoffset()");
                entity.Property(e => e.DeleteType).HasMaxLength(50).IsRequired().HasDefaultValue("Everyone");

                entity.HasOne(e => e.Message)
                    .WithOne(m => m.DeleteLog)
                    .HasForeignKey<MessageDelete>(e => e.MessageId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.DeletedBy)
                    .WithMany()
                    .HasForeignKey(e => e.DeletedById)
                    .OnDelete(DeleteBehavior.NoAction);
            });

            // FileRetentionPolicy
            modelBuilder.Entity<FileRetentionPolicy>(entity =>
            {
                entity.ToTable("FileRetentionPolicies");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Id).HasColumnName("id");
                entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(100).IsRequired();
                entity.Property(e => e.RetentionPeriodDays).HasColumnName("retention_period_days").IsRequired();
                entity.Property(e => e.Action).HasColumnName("action").HasMaxLength(50).IsRequired();
                entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("sysdatetimeoffset()");
            });

            // Folders
            modelBuilder.Entity<Folder>(entity =>
            {
                entity.ToTable("Folders");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Id).HasColumnName("id");
                entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(255).IsRequired();
                entity.Property(e => e.ParentId).HasColumnName("parent_id");
                entity.Property(e => e.OwnerId).HasColumnName("owner_id").IsRequired();
                entity.Property(e => e.SpaceType).HasColumnName("space_type").HasMaxLength(50).IsRequired();
                entity.Property(e => e.SpaceTargetId).HasColumnName("space_target_id");
                entity.Property(e => e.IsDeleted).HasColumnName("is_deleted");
                entity.Property(e => e.DeletedAt).HasColumnName("deleted_at");
                entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("sysdatetimeoffset()");
                entity.Property(e => e.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("sysdatetimeoffset()");

                entity.HasOne(e => e.Parent)
                    .WithMany(f => f.SubFolders)
                    .HasForeignKey(e => e.ParentId)
                    .OnDelete(DeleteBehavior.NoAction);
            });

            // FileMetadata (Files)
            modelBuilder.Entity<FileMetadata>(entity =>
            {
                entity.ToTable("Files");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Id).HasColumnName("id");
                entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(255).IsRequired();
                entity.Property(e => e.FolderId).HasColumnName("folder_id").IsRequired();
                entity.Property(e => e.OwnerId).HasColumnName("owner_id").IsRequired();
                entity.Property(e => e.SpaceType).HasColumnName("space_type").HasMaxLength(50).IsRequired();
                entity.Property(e => e.SpaceTargetId).HasColumnName("space_target_id");
                entity.Property(e => e.IsDeleted).HasColumnName("is_deleted");
                entity.Property(e => e.DeletedAt).HasColumnName("deleted_at");
                entity.Property(e => e.RetentionPolicyId).HasColumnName("retention_policy_id");
                entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("sysdatetimeoffset()");
                entity.Property(e => e.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("sysdatetimeoffset()");
                entity.Property(e => e.CurrentVersionId).HasColumnName("current_version_id");

                entity.HasOne(e => e.Folder)
                    .WithMany(f => f.Files)
                    .HasForeignKey(e => e.FolderId)
                    .OnDelete(DeleteBehavior.NoAction);

                entity.HasOne(e => e.Owner)
                    .WithMany()
                    .HasForeignKey(e => e.OwnerId)
                    .OnDelete(DeleteBehavior.NoAction);

                entity.HasOne(e => e.CurrentVersion)
                    .WithMany()
                    .HasForeignKey(e => e.CurrentVersionId)
                    .OnDelete(DeleteBehavior.NoAction);

                entity.HasOne(e => e.RetentionPolicy)
                    .WithMany()
                    .HasForeignKey(e => e.RetentionPolicyId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            // FileVersion
            modelBuilder.Entity<FileVersion>(entity =>
            {
                entity.ToTable("FileVersions");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Id).HasColumnName("id");
                entity.Property(e => e.FileId).HasColumnName("file_id").IsRequired();
                entity.Property(e => e.VersionNumber).HasColumnName("version_number").IsRequired();
                entity.Property(e => e.PhysicalPath).HasColumnName("physical_path").HasMaxLength(500).IsRequired();
                entity.Property(e => e.HashValue).HasColumnName("hash_value").HasMaxLength(64).IsRequired();
                entity.Property(e => e.FileSize).HasColumnName("file_size").IsRequired();
                entity.Property(e => e.MimeType).HasColumnName("mime_type").HasMaxLength(100).IsRequired();
                entity.Property(e => e.UploadedBy).HasColumnName("uploaded_by").IsRequired();
                entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("sysdatetimeoffset()");

                entity.HasOne(e => e.File)
                    .WithMany(f => f.Versions)
                    .HasForeignKey(e => e.FileId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(e => new { e.FileId, e.VersionNumber }).IsUnique();
            });

            // FilePermission
            modelBuilder.Entity<FilePermission>(entity =>
            {
                entity.ToTable("FilePermissions");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Id).HasColumnName("id");
                entity.Property(e => e.FileId).HasColumnName("file_id");
                entity.Property(e => e.FolderId).HasColumnName("folder_id");
                entity.Property(e => e.UserId).HasColumnName("user_id");
                entity.Property(e => e.RoleName).HasColumnName("role_name").HasMaxLength(100);
                entity.Property(e => e.PermissionLevel).HasColumnName("permission_level").HasMaxLength(50).IsRequired();
                entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("sysdatetimeoffset()");
                entity.Property(e => e.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("sysdatetimeoffset()");

                entity.HasOne(e => e.File)
                    .WithMany(f => f.Permissions)
                    .HasForeignKey(e => e.FileId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Folder)
                    .WithMany()
                    .HasForeignKey(e => e.FolderId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(e => new { e.FileId, e.UserId }).IsUnique().HasFilter("[file_id] IS NOT NULL AND [user_id] IS NOT NULL");
                entity.HasIndex(e => new { e.FolderId, e.UserId }).IsUnique().HasFilter("[folder_id] IS NOT NULL AND [user_id] IS NOT NULL");
            });

            // FileShare
            modelBuilder.Entity<Models.Entities.FileShare>(entity =>
            {
                entity.ToTable("FileShares");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Id).HasColumnName("id");
                entity.Property(e => e.SharedBy).HasColumnName("shared_by").IsRequired();
                entity.Property(e => e.RecipientType).HasColumnName("recipient_type").HasMaxLength(50).IsRequired();
                entity.Property(e => e.RecipientId).HasColumnName("recipient_id").IsRequired();
                entity.Property(e => e.FileId).HasColumnName("file_id");
                entity.Property(e => e.FolderId).HasColumnName("folder_id");
                entity.Property(e => e.PermissionLevel).HasColumnName("permission_level").HasMaxLength(50).IsRequired();
                entity.Property(e => e.ShareLinkToken).HasColumnName("share_link_token").HasMaxLength(255);
                entity.Property(e => e.ExpiresAt).HasColumnName("expires_at");
                entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("sysdatetimeoffset()");

                entity.HasOne(e => e.File)
                    .WithMany(f => f.Shares)
                    .HasForeignKey(e => e.FileId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Folder)
                    .WithMany()
                    .HasForeignKey(e => e.FolderId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // FileTag
            modelBuilder.Entity<FileTag>(entity =>
            {
                entity.ToTable("FileTags");
                entity.HasKey(e => new { e.FileId, e.Tag });
                entity.Property(e => e.FileId).HasColumnName("file_id");
                entity.Property(e => e.Tag).HasColumnName("tag").HasMaxLength(100).IsRequired();

                entity.HasOne(e => e.File)
                    .WithMany(f => f.Tags)
                    .HasForeignKey(e => e.FileId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // FileAuditLog
            modelBuilder.Entity<FileAuditLog>(entity =>
            {
                entity.ToTable("FileAuditLogs");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Id).HasColumnName("id");
                entity.Property(e => e.ActorId).HasColumnName("actor_id").IsRequired();
                entity.Property(e => e.Action).HasColumnName("action").HasMaxLength(100).IsRequired();
                entity.Property(e => e.FileId).HasColumnName("file_id");
                entity.Property(e => e.FolderId).HasColumnName("folder_id");
                entity.Property(e => e.VersionId).HasColumnName("version_id");
                entity.Property(e => e.IpAddress).HasColumnName("ip_address").HasMaxLength(50).IsRequired();
                entity.Property(e => e.UserAgent).HasColumnName("user_agent").HasMaxLength(500);
                entity.Property(e => e.Details).HasColumnName("details").IsRequired();
                entity.Property(e => e.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("sysdatetimeoffset()");
            });

            // ==========================================
            // VOICE CALLING MAPPINGS
            // ==========================================

            modelBuilder.Entity<Call>(entity =>
            {
                entity.ToTable("Calls");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Status).HasMaxLength(50).IsRequired();
                entity.Property(e => e.Type).HasMaxLength(50).IsRequired();
                entity.Property(e => e.UserFeedback).HasMaxLength(500);

                entity.HasOne(e => e.Caller)
                    .WithMany()
                    .HasForeignKey(e => e.CallerId)
                    .OnDelete(DeleteBehavior.NoAction);

                entity.HasOne(e => e.Conversation)
                    .WithMany()
                    .HasForeignKey(e => e.ConversationId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasOne(e => e.Meeting)
                    .WithMany()
                    .HasForeignKey(e => e.MeetingId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<Meeting>(entity =>
            {
                entity.ToTable("Meetings");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Title).HasMaxLength(200).IsRequired();
                entity.Property(e => e.MeetingCode).HasMaxLength(20).IsRequired();
                
                entity.HasIndex(e => e.MeetingCode).IsUnique();

                entity.HasOne(e => e.Organizer)
                    .WithMany()
                    .HasForeignKey(e => e.OrganizerId)
                    .OnDelete(DeleteBehavior.NoAction);

                entity.HasOne(e => e.Conversation)
                    .WithMany()
                    .HasForeignKey(e => e.ConversationId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<CallQualityMetric>(entity =>
            {
                entity.ToTable("CallQualityMetrics");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.IceType).HasMaxLength(20);
                entity.Property(e => e.Resolution).HasMaxLength(20);
                entity.Property(e => e.PacketLoss).HasPrecision(5, 2);
                entity.Property(e => e.Jitter).HasPrecision(10, 2);
                
                entity.HasOne(e => e.Call)
                    .WithMany()
                    .HasForeignKey(e => e.CallId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.NoAction);
            });

            modelBuilder.Entity<PaymentTransaction>(entity =>
            {
                entity.ToTable("PaymentTransactions");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.RazorpayOrderId).HasMaxLength(100).IsRequired();
                entity.Property(e => e.RazorpayPaymentId).HasMaxLength(100);
                entity.Property(e => e.RazorpaySignature).HasMaxLength(200);
                entity.Property(e => e.PlanId).HasMaxLength(50).IsRequired();
                entity.Property(e => e.Currency).HasMaxLength(10).IsRequired();
                entity.Property(e => e.Amount).HasPrecision(18, 2);
                entity.Property(e => e.Status).HasMaxLength(50).IsRequired();

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<CallParticipant>(entity =>
            {
                entity.ToTable("CallParticipants");
                entity.HasKey(e => new { e.CallId, e.UserId });
                entity.Property(e => e.Role).HasMaxLength(50).IsRequired();
                entity.Property(e => e.Status).HasMaxLength(50).IsRequired();

                entity.HasOne(e => e.Call)
                    .WithMany(c => c.Participants)
                    .HasForeignKey(e => e.CallId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.NoAction);
            });

            modelBuilder.Entity<UserBlock>(entity =>
            {
                entity.ToTable("UserBlocks");
                entity.HasKey(e => e.Id);

                entity.HasOne(e => e.Blocker)
                    .WithMany()
                    .HasForeignKey(e => e.BlockerId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Blocked)
                    .WithMany()
                    .HasForeignKey(e => e.BlockedId)
                    .OnDelete(DeleteBehavior.NoAction);

                entity.HasIndex(e => new { e.BlockerId, e.BlockedId }).IsUnique();
            });

            modelBuilder.Entity<FavoriteContact>(entity =>
            {
                entity.ToTable("FavoriteContacts");
                entity.HasKey(e => e.Id);

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Contact)
                    .WithMany()
                    .HasForeignKey(e => e.ContactId)
                    .OnDelete(DeleteBehavior.NoAction);

                entity.HasIndex(e => new { e.UserId, e.ContactId }).IsUnique();
            });

            modelBuilder.Entity<CallInvitation>(entity =>
            {
                entity.ToTable("CallInvitations");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Status).HasMaxLength(50).IsRequired();

                entity.HasOne(e => e.Call)
                    .WithMany()
                    .HasForeignKey(e => e.CallId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Inviter)
                    .WithMany()
                    .HasForeignKey(e => e.InviterId)
                    .OnDelete(DeleteBehavior.NoAction);

                entity.HasOne(e => e.Invitee)
                    .WithMany()
                    .HasForeignKey(e => e.InviteeId)
                    .OnDelete(DeleteBehavior.NoAction);
            });

            modelBuilder.Entity<CallEvent>(entity =>
            {
                entity.ToTable("CallEvents");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.EventType).HasMaxLength(100).IsRequired();
                entity.Property(e => e.Details).HasMaxLength(1000).IsRequired();

                entity.HasOne(e => e.Call)
                    .WithMany(c => c.Events)
                    .HasForeignKey(e => e.CallId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<CallDevice>(entity =>
            {
                entity.ToTable("CallDevices");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.ConnectionId).HasMaxLength(200).IsRequired();
                entity.Property(e => e.DeviceName).HasMaxLength(200).IsRequired();
                entity.Property(e => e.DeviceType).HasMaxLength(100).IsRequired();
                entity.Property(e => e.Status).HasMaxLength(50).IsRequired();

                entity.HasOne(e => e.Call)
                    .WithMany()
                    .HasForeignKey(e => e.CallId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.NoAction);
            });

            modelBuilder.Entity<CallStatistic>(entity =>
            {
                entity.ToTable("CallStatistics");
                entity.HasKey(e => e.Id);

                entity.HasOne(e => e.Call)
                    .WithMany()
                    .HasForeignKey(e => e.CallId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.NoAction);
            });

            modelBuilder.Entity<CallAuditLog>(entity =>
            {
                entity.ToTable("CallAuditLogs");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Action).HasMaxLength(100).IsRequired();
                entity.Property(e => e.IpAddress).HasMaxLength(50).IsRequired();
                entity.Property(e => e.Details).HasMaxLength(1000).IsRequired();

                entity.HasOne(e => e.Call)
                    .WithMany()
                    .HasForeignKey(e => e.CallId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Actor)
                    .WithMany()
                    .HasForeignKey(e => e.ActorId)
                    .OnDelete(DeleteBehavior.NoAction);
            });
        }

        public override int SaveChanges()
        {
            PreventAuditLogModification();
            return base.SaveChanges();
        }

        public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            PreventAuditLogModification();
            return base.SaveChangesAsync(cancellationToken);
        }

        private void PreventAuditLogModification()
        {
            foreach (var entry in ChangeTracker.Entries<AuditLog>())
            {
                if (entry.State == EntityState.Modified || entry.State == EntityState.Deleted)
                {
                    throw new InvalidOperationException("Audit logs are immutable and cannot be updated or deleted.");
                }
            }

            foreach (var entry in ChangeTracker.Entries<FileAuditLog>())
            {
                if (entry.State == EntityState.Modified || entry.State == EntityState.Deleted)
                {
                    throw new InvalidOperationException("File audit logs are immutable and cannot be updated or deleted.");
                }
            }

            foreach (var entry in ChangeTracker.Entries<CallAuditLog>())
            {
                if (entry.State == EntityState.Modified || entry.State == EntityState.Deleted)
                {
                    throw new InvalidOperationException("Call audit logs are immutable and cannot be updated or deleted.");
                }
            }

            foreach (var entry in ChangeTracker.Entries<GroupAuditLog>())
            {
                if (entry.State == EntityState.Modified || entry.State == EntityState.Deleted)
                {
                    throw new InvalidOperationException("Group audit logs are immutable and cannot be updated or deleted.");
                }
            }
        }
    }
}
