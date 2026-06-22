import { useState, useEffect, useRef } from 'react';
import MessageItem from './MessageItem';

function ChatViewport({
  currentUser,
  activeChat,
  usersCache,
  typingState,
  onSendMessage,
  sendTypingIndicator,
  onUploadFile,
  onDownloadFile,
  onArchive,
  onDeleteConversation,
  toggleDetails,
  replyMessageId,
  setReplyMessageId,
  editMessageId,
  setEditMessageId,
  onShowContextMenu,
  onStartCall,
  onStartGroupCall,
  token
}) {
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  
  const typingTimeoutRef = useRef(null);
  const isTypingStateRef = useRef(false);

  // Enforce PostingRestrictions
  const myMemberInfo = activeChat?.memberDetails?.find(m => m.userId === currentUser?.id);
  const myRole = myMemberInfo?.role || 'Employee';
  const postingRestriction = activeChat?.settings?.postingRestriction || 'AnyMember';
  let canPost = true;

  if (activeChat?.type !== 'dm') {
    if (postingRestriction === 'OnlyOwners') {
      canPost = myRole === 'Owner';
    } else if (postingRestriction === 'OnlyOwnersAndManagers') {
      canPost = myRole === 'Owner' || myRole === 'Manager';
    }
  }

  // Auto-scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeChat?.messages?.length]);

  // Set input text if editing a message
  useEffect(() => {
    if (editMessageId && activeChat?.messages) {
      const msg = activeChat.messages.find(m => m.id === editMessageId);
      if (msg) {
        setMessageText(msg.content || '');
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }
    } else {
      setMessageText('');
    }
  }, [editMessageId, activeChat]);

  if (!activeChat) {
    return (
      <main className="chat-viewport chat-viewport-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem', textAlign: 'center', background: 'var(--bg-app)' }}>
        <div style={{ marginBottom: '1.5rem', color: 'var(--primary)', opacity: 0.8 }}>
          <i className="fa-regular fa-comments" style={{ fontSize: '4.5rem' }}></i>
        </div>
        <h2 style={{ fontSize: '1.75rem', marginBottom: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Welcome to SecureComm</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2.5rem', maxWidth: '400px', fontSize: '1.1rem', lineHeight: '1.5' }}>
          Select a conversation from the sidebar or start a new chat to begin collaborating with your team.
        </p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-primary" onClick={() => document.getElementById('add-dm-btn')?.click()} style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}>
            <i className="fa-solid fa-plus icon"></i> New Chat
          </button>
          <button className="btn btn-secondary" onClick={() => document.getElementById('add-group-btn')?.click()} style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}>
            <i className="fa-solid fa-user-group icon"></i> New Group
          </button>
        </div>
      </main>
    );
  }

  const handleSend = () => {
    if (!messageText.trim()) return;
    onSendMessage(messageText);
    setMessageText('');
    
    // Stop typing state
    if (isTypingStateRef.current) {
      isTypingStateRef.current = false;
      sendTypingIndicator(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else {
      // Trigger typing state
      if (!isTypingStateRef.current) {
        isTypingStateRef.current = true;
        sendTypingIndicator(true);
      }
      
      // Reset typing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = setTimeout(() => {
        isTypingStateRef.current = false;
        sendTypingIndicator(false);
      }, 3000);
    }
  };

  const insertFormat = (tagBefore, tagAfter = '') => {
    const textarea = inputRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);
    const replacement = tagBefore + selectedText + tagAfter;

    setMessageText(text.substring(0, start) + replacement + text.substring(end));
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tagBefore.length, start + tagBefore.length + selectedText.length);
    }, 0);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      onUploadFile(file);
    }
    e.target.value = ''; // Reset uploader input
  };

  // Compile active typers (excluding current user)
  const activeTypers = Object.entries(typingState || {})
    .filter(([username, isTyping]) => isTyping && username !== currentUser?.username)
    .map(([username]) => username);

  let typingText = "";
  if (activeTypers.length === 1) {
    typingText = `${activeTypers[0]} is typing...`;
  } else if (activeTypers.length > 1) {
    typingText = `${activeTypers.slice(0, 2).join(' & ')} are typing...`;
  }

  const replyingToMessage = replyMessageId && activeChat?.messages
    ? activeChat.messages.find(m => m.id === replyMessageId) 
    : null;
  const replyingToUser = replyingToMessage && usersCache && usersCache[replyingToMessage.senderId]
    ? usersCache[replyingToMessage.senderId].displayName
    : 'User';

  const messagesList = (activeChat.messages || []).filter(msg => {
    if (!msg) return false;
    const type = (msg.type || '').toLowerCase();
    const attachment = msg.attachment || (msg.attachments && msg.attachments[0]) || (msg.Attachments && msg.Attachments[0]);
    const fileName = attachment?.fileName || attachment?.FileName || '';
    const content = msg.content || msg.Content || '';
    const isVoicemail = type === 'attachment' && (
      fileName.startsWith('voicemail-') || content.startsWith('voicemail-')
    );
    return !isVoicemail;
  });
  const membersList = activeChat.members || [];

  // Channel prefix parsing for display name and team name
  let displayName = activeChat.name || '';
  let teamName = '';
  if (activeChat.type === 'channel') {
    const cleanName = (activeChat.name || '').replace(/^#\s*/, '');
    const match = cleanName.match(/^\[(.*?)\]\s*(.*)$/);
    if (match) {
      teamName = match[1];
      displayName = match[2];
    } else {
      const nameLower = cleanName.toLowerCase();
      if (nameLower.includes('general') || nameLower.includes('announcement') || nameLower.includes('command')) {
        teamName = "Command Center";
      } else {
        teamName = "Tactical Operations";
      }
    }
  }

  return (
    <main className="chat-viewport">
      {/* Chat Header */}
      <header className="chat-header">
        <div className="left-controls">
          <div className="active-conversation-meta">
            {activeChat.type === 'channel' ? (
              <>
                <div className="chat-header-team-name">
                  <span>{teamName}</span>
                  <i className="fa-solid fa-chevron-right chat-header-chevron"></i>
                </div>
                <h3 id="chat-title" className="chat-header-title">
                  <i className="fa-solid fa-hashtag chat-header-hash-icon"></i>
                  {displayName}
                </h3>
              </>
            ) : (
              <h3 id="chat-title">{activeChat.name || ''}</h3>
            )}
            <p id="chat-sub-info">
              {(activeChat.type || '').toUpperCase()} • {membersList.length} members
            </p>
          </div>
        </div>
        <div className="right-controls">
          {activeChat.type === 'dm' && (
            <button 
              className="icon-btn call-btn" 
              id="btn-direct-call" 
              onClick={() => {
                const otherMemberUsername = (activeChat.members || []).find(username => username !== currentUser?.username);
                const otherMember = Object.values(usersCache || {}).find(u => u && u.username === otherMemberUsername);
                if (otherMember) {
                  onStartCall(otherMember, false);
                } else {
                  alert("Could not locate participant profile to call.");
                }
              }}
              title="Start Voice Call"
            >
              <i className="fa-solid fa-phone"></i>
            </button>
          )}
          {(activeChat.type === 'group' || activeChat.type === 'channel') && (
            <button 
              className="icon-btn call-btn" 
              id="btn-group-call" 
              onClick={() => {
                const callName = activeChat.type === 'channel' && teamName
                  ? `${teamName} - ${displayName}`
                  : (activeChat.name || '');
                onStartGroupCall(activeChat.id, callName);
              }}
              title="Start Group Voice Call"
            >
              <i className="fa-solid fa-phone-volume"></i>
            </button>
          )}
          {(activeChat.createdById === currentUser?.id || currentUser?.role === "Super Administrator" || currentUser?.role === "Administrator") && (
            <button 
              className="icon-btn delete-btn" 
              id="btn-delete-chat" 
              onClick={() => {
                if (window.confirm("Are you sure you want to permanently delete this conversation? This will delete all messages and attachments for everyone.")) {
                  onDeleteConversation(activeChat.id);
                }
              }}
              title="Delete Conversation"
            >
              <i className="fa-solid fa-trash-can"></i>
            </button>
          )}
          <button 
            className="icon-btn" 
            id="btn-archive-chat" 
            onClick={onArchive}
            title="Archive Conversation"
          >
            <i className="fa-solid fa-box-archive"></i>
          </button>
          <button 
            className="icon-btn" 
            id="btn-details-toggle" 
            onClick={toggleDetails}
            title="Toggle Details Panel"
          >
            <i className="fa-solid fa-circle-info"></i>
          </button>
        </div>
      </header>

      {/* Message Feed Container */}
      <section className="messages-container" id="messages-container">
        {messagesList.length === 0 ? (
          <div className="message-node system">
            <div className="message-bubble">
              <p>No messages in this secure room yet.</p>
            </div>
          </div>
        ) : (
          messagesList.map(msg => {
            if (!msg) return null;
            return (
              <MessageItem
                key={msg.id}
                msg={msg}
                currentUser={currentUser}
                usersCache={usersCache}
                onDownloadFile={onDownloadFile}
                onShowContextMenu={onShowContextMenu}
                activeChat={activeChat}
                token={token}
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </section>

      {/* Typing Indicator */}
      <div className={`typing-indicator-row ${typingText ? 'active' : ''}`} id="typing-indicator">
        <div className="dot-typing"></div>
        <span id="typing-text">{typingText}</span>
      </div>

      {/* Threaded Reply Bar */}
      {replyingToMessage && (
        <div className="reply-bar" id="reply-bar">
          <div className="reply-content">
            <i className="fa-solid fa-reply"></i>
            <span>
              Replying to <strong>{replyingToUser || 'User'}</strong>:{' '}
              <span id="reply-text-preview">
                {(replyingToMessage.content || '').substring(0, 50)}
                {(replyingToMessage.content || '').length > 50 ? '...' : ''}
              </span>
            </span>
          </div>
          <i 
            className="fa-solid fa-xmark close-btn" 
            id="cancel-reply"
            onClick={() => setReplyMessageId(null)}
          ></i>
        </div>
      )}

      {/* Input Box Panel */}
      <footer className="chat-input-panel">
        <div className="rich-text-toolbar">
          <button className="toolbar-btn" onClick={() => insertFormat('**', '**')} title="Bold">
            <i className="fa-solid fa-bold"></i>
          </button>
          <button className="toolbar-btn" onClick={() => insertFormat('*', '*')} title="Italic">
            <i className="fa-solid fa-italic"></i>
          </button>
          <button className="toolbar-btn" onClick={() => insertFormat('`', '`')} title="Code Block">
            <i className="fa-solid fa-code"></i>
          </button>
          <button className="toolbar-btn" onClick={() => insertFormat('> ')} title="Quote">
            <i className="fa-solid fa-quote-left"></i>
          </button>
        </div>
        
        <div className="input-form">
          {/* File Attachment Button */}
          <button className="action-btn" disabled={!canPost} onClick={() => fileInputRef.current.click()} title="Attach Files">
            <i className="fa-solid fa-paperclip"></i>
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
          />

          {/* Message Text Area */}
          <textarea 
            ref={inputRef}
            id="message-input" 
            placeholder={!canPost ? "Only Owners and Managers can post in this channel (Announcements Mode)" : editMessageId ? "Edit your secure message..." : "Type a secure message... Use @ to mention"}
            rows="1"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!canPost}
          ></textarea>

          {/* Send Button */}
          <button className="send-btn" disabled={!canPost} onClick={handleSend} id="btn-send-message">
            <i className={`fa-solid ${editMessageId ? 'fa-check' : 'fa-paper-plane'}`}></i>
          </button>
        </div>
      </footer>
    </main>
  );
}

export default ChatViewport;
