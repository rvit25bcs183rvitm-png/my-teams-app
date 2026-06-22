# SecureComm Platform - Test Credentials & Setup Guide

## Application Status ✅
- **Frontend**: Running on `http://localhost:3001/`
- **Backend**: Running on `http://localhost:5143/`
- **Database**: SQL Server (LocalDB) - Initialized with sample data

---

## Test User Accounts

### Default Admin Account
| Username | Password | Role | Department |
|----------|----------|------|-----------|
| `admin` | `AdminPassword123!` | Super Administrator | N/A |

### Test User Accounts (All use password: `TestPassword123!`)
| Username | Display Name | Email | Department |
|----------|--------------|-------|-----------|
| `john.smith` | John Smith | john@team.local | Engineering |
| `sarah.jones` | Sarah Jones | sarah@team.local | Marketing |
| `mike.wilson` | Mike Wilson | mike@team.local | Sales |
| `lisa.brown` | Lisa Brown | lisa@team.local | Engineering |
| `david.lee` | David Lee | david@team.local | Operations |

---

## Quick Start

### Login Instructions
1. Go to `http://localhost:3001/`
2. Enter any username/password from the table above
3. The app will automatically load your conversations and messages
4. Chat persists when you logout and login again

### Pre-configured Channels
The following channels are available to all users:
- `#general` - General discussion
- `#announcements` - Important announcements
- `#random` - Off-topic chat

---

## Recent Updates & Fixes

### 1. ✅ Chat History Persistence (Fixed)
**Issue**: When logging out, conversations were cleared and not restored on re-login
**Solution**: 
- Enhanced `fetchConversations()` to properly refetch all conversations from server after login
- Added logging to track conversation loading
- Improved `handleLogout()` to cleanly stop SignalR before clearing state

### 2. ✅ Test User Accounts Created
**Added**: 5 new test users with different departments for team collaboration testing
- All test users have access to default channels
- Pre-configured for message history and presence tracking
- Active session management

### 3. ✅ FileShare Ambiguity Fixed
**Resolved**: Namespace conflict between `System.IO.FileShare` and `Models.Entities.FileShare`
- Qualified all FileShare entity references with `Models.Entities.` namespace
- Applied fix in ApplicationDbContext.cs (line 514) and StorageService.cs (lines 618, 705)

### 4. ✅ Dashboard Initialization Improved
- `initializeDashboard()` now properly fetches users list and conversations
- SignalR connection establishes only after dashboard data is loaded
- Better state management during login transitions

---

## Teams-like Features Implemented

### Current Features
✅ **Channels** - Team-wide communication  
✅ **Direct Messages** - 1-on-1 private chats  
✅ **Group Chats** - Multi-user conversations  
✅ **Real-time Messaging** - SignalR integration  
✅ **Presence Status** - Online/Busy/Away/DND indicators  
✅ **Typing Indicators** - See when others are typing  
✅ **Message Reactions** - Emoji reactions on messages  
✅ **Message Editing** - Edit messages within 15min grace period  
✅ **Message History** - View up to 100 previous messages  
✅ **File Attachments** - Share files in conversations  
✅ **Read Receipts** - Track message delivery status  

### Upcoming Enhancements
🔲 Threads/Replies  
🔲 @Mentions & Notifications  
🔲 Message Search  
🔲 User Profiles  
🔲 Admin Dashboard  
🔲 Encryption (E2E)  
🔲 Voice/Video Calls  
🔲 Screen Sharing  
🔲 Channel Permissions  
🔲 Integration Webhooks  

---

## Key Files Modified

### Backend Changes
- **[Data/DbInitializer.cs](Data/DbInitializer.cs#L290)** - Added test users and sample channels initialization
- **[Data/ApplicationDbContext.cs](Data/ApplicationDbContext.cs#L514)** - Fixed FileShare namespace ambiguity
- **[Services/StorageService.cs](Services/StorageService.cs#L618)** - Qualified FileShare entity references

### Frontend Changes
- **[src/App.jsx](src/App.jsx)** - Enhanced logout/login flow and conversation fetching
  - Improved `handleLogout()` with proper cleanup
  - Enhanced `saveTokens()` to reset conversation state
  - Better `fetchConversations()` with logging and error handling

---

## Recommended Testing Workflow

### Test 1: Chat Persistence
1. Login with `john.smith` / `TestPassword123!`
2. Send a message in #general channel
3. Logout
4. Login with `john.smith` / `TestPassword123!` again
5. **Expected**: Previous messages and chat history appear

### Test 2: Multiple Users
1. Open app in two browser windows
2. Login as `john.smith` in Window 1
3. Login as `sarah.jones` in Window 2
4. Send messages between them
5. **Expected**: Real-time message delivery with SignalR

### Test 3: Presence & Typing
1. Login with multiple users
2. Change presence status (Online → Busy → Away, etc.)
3. Start typing in a channel
4. **Expected**: Other users see typing indicator and presence changes

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  Frontend (React + Vite)                         │
│  - Components: Sidebar, ChatViewport, etc        │
│  - Real-time via SignalR HubConnection          │
└────────────────┬────────────────────────────────┘
                 │
                 ↓ HTTP/WebSocket
┌─────────────────────────────────────────────────┐
│  Backend (ASP.NET Core 10)                      │
│  - Controllers: Auth, Messages, Conversations   │
│  - Hubs: ChatHub (SignalR real-time)           │
│  - Services: MessageService, etc                │
└────────────────┬────────────────────────────────┘
                 │
                 ↓ EF Core
┌─────────────────────────────────────────────────┐
│  Database (SQL Server LocalDB)                  │
│  - Users, Conversations, Messages, etc          │
│  - Full audit logging & permissions             │
└─────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Issue: "Cannot connect to backend server"
- Ensure backend is running: `http://localhost:5143/`
- Check database service is available
- View backend logs for errors

### Issue: "Conversations not loading"
- Check browser console for errors
- Verify you're logged in (token in localStorage)
- Refresh the page (F5)

### Issue: "Messages disappear after logout"
- This is now FIXED - messages should persist!
- If still occurring, clear localStorage and log back in
- Check browser console for errors

---

## Security Notes

🔒 **Password Requirements**: Min 8 chars, mix of upper/lower/numbers/symbols  
🔒 **Session Management**: Automatic session tracking & cleanup  
🔒 **Audit Logging**: All login/logout events logged  
🔒 **Lockout Protection**: Account lockout after failed attempts  
🔒 **JWT Tokens**: Access tokens valid for 1 hour  

---

## Support & Next Steps

1. **Test all credentials** and verify persistence
2. **Report any issues** with chat history or message delivery
3. **Feature requests**: Add to Upcoming Enhancements section
4. **Performance testing**: Load test with multiple concurrent users
5. **Security audit**: Penetration test the API endpoints

---

**Last Updated**: 2026-06-14  
**Version**: 1.0 Beta  
**Status**: Development/Testing
