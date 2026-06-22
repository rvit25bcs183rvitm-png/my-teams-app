import React from 'react';
import { BASE_URL } from '../config';

function formatTimestamp(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const hrs = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `${hrs}:${mins}`;
}

function VoicePlayer({ attachmentId, token }) {
  const [audioUrl, setAudioUrl] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    if (!attachmentId || !token) return;

    let active = true;
    const fetchVoiceBlob = async () => {
      try {
        setIsLoading(true);
        setError(false);
        const res = await fetch(`${BASE_URL}/api/messages/attachments/${attachmentId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok && active) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
        } else if (active) {
          setError(true);
        }
      } catch (err) {
        console.error("Error loading voice message:", err);
        if (active) setError(true);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    fetchVoiceBlob();

    return () => {
      active = false;
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [attachmentId, token]);

  if (isLoading) {
    return (
      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
        <i className="fa-solid fa-spinner fa-spin"></i> Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontSize: '0.85rem', color: '#ef4444', padding: '4px 0' }}>
        <i className="fa-solid fa-triangle-exclamation"></i> Error loading audio.
      </div>
    );
  }

  return (
    <audio controls src={audioUrl} style={{ width: '100%', height: '32px' }} />
  );
}

function MessageItem({
  msg,
  currentUser,
  usersCache,
  onDownloadFile,
  onShowContextMenu,
  activeChat,
  token
}) {
  if (!msg) return null;

  const isOutgoing = msg.senderId === currentUser?.id;
  const sender = (usersCache && usersCache[msg.senderId]) || { displayName: "User", avatarClass: "avatar-blue", letter: "U" };

  let bodyContent = msg.content || '';
  let meetingCard = null;
  if (msg.content && msg.content.startsWith('[MEETING_SCHEDULED]:')) {
    try {
      const dataStr = msg.content.substring('[MEETING_SCHEDULED]:'.length);
      const meetingData = JSON.parse(dataStr);
      meetingCard = (
        <div className="meeting-invite-card" style={{
          background: 'rgba(99, 102, 241, 0.1)',
          borderLeft: '4px solid var(--primary)',
          borderRadius: '8px',
          padding: '12px',
          marginTop: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxWidth: '320px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', color: 'var(--primary)', fontSize: '0.8rem' }}>
            <i className="fa-solid fa-calendar-check"></i> Scheduled Meeting Invite
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#fff' }}>{meetingData.title}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <i className="fa-regular fa-calendar" style={{ marginRight: '6px' }}></i> {meetingData.date} @ {meetingData.time} ({meetingData.duration} mins)
          </div>
          {meetingData.description && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}>
              {meetingData.description}
            </div>
          )}
        </div>
      );
      bodyContent = '';
    } catch (e) {
      console.warn("Failed to parse scheduled meeting JSON", e);
    }
  }

  const handleContextMenu = (e) => {
    e.preventDefault();
    onShowContextMenu(msg.id, e.clientX, e.clientY);
  };

  // Look up parent reply preview
  let parentReplyPreview = null;
  if (msg.parentMessageId && activeChat?.messages) {
    const parentMsg = activeChat.messages.find(m => m.id === msg.parentMessageId);
    if (parentMsg) {
      const parentSender = (usersCache && usersCache[parentMsg.senderId]) || { displayName: "User" };
      parentReplyPreview = (
        <div className="parent-reply-preview">
          <i className="fa-solid fa-share"></i>
          <span>
            <strong>{parentSender.displayName || ''}</strong>:{' '}
            {(parentMsg.content || '').substring(0, 30)}
            {(parentMsg.content || '').length > 30 ? '...' : ''}
          </span>
        </div>
      );
    }
  }

  // Render attachment if any
  let attachmentMarkup = null;
  if (msg.attachment) {
    const isImage = (msg.attachment.fileType || '').toLowerCase().includes('image') ||
                    /\.(jpg|jpeg|png|gif|webp)$/i.test(msg.attachment.fileName || '');
    const isAudio = (msg.attachment.fileType || '').toLowerCase().includes('audio') ||
                    /\.(webm|wav|mp3|m4a|ogg)$/i.test(msg.attachment.fileName || '');

    if (isImage) {
      attachmentMarkup = (
        <div className="attachment-card image-card">
          <img
            src={msg.attachment.storagePath || ''}
            className="attachment-card-img"
            alt="Attached"
          />
          <div className="attachment-image-footer">
            <span className="attachment-name">
              {msg.attachment.fileName || ''}
            </span>
            <i
              className="fa-solid fa-download attachment-download-btn"
              onClick={(e) => { e.stopPropagation(); onDownloadFile(msg.attachment.fileName, msg.attachment.id); }}
            ></i>
          </div>
        </div>
      );
    } else if (isAudio) {
      attachmentMarkup = (
        <div className="attachment-card audio-card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', width: '280px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--primary)' }}>
            <i className="fa-solid fa-microphone"></i> Voice Mail Recording
          </div>
          <VoicePlayer attachmentId={msg.attachment.id} token={token} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            <span>{msg.attachment.fileName || ''}</span>
            <i
              className="fa-solid fa-download attachment-download-btn"
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onDownloadFile(msg.attachment.fileName, msg.attachment.id); }}
            ></i>
          </div>
        </div>
      );
    } else {
      attachmentMarkup = (
        <div className="attachment-card">
          <i className="fa-solid fa-file-pdf attachment-icon"></i>
          <div className="attachment-info">
            <span className="attachment-name">{msg.attachment.fileName || ''}</span>
            <span className="attachment-size">
              {((msg.attachment.fileSize || 0) / 1024).toFixed(1)} KB
            </span>
          </div>
          <i
            className="fa-solid fa-download attachment-download-btn"
            onClick={(e) => { e.stopPropagation(); onDownloadFile(msg.attachment.fileName, msg.attachment.id); }}
          ></i>
        </div>
      );
    }
  }

  return (
    <div
      className={`message-node ${isOutgoing ? 'outgoing' : 'incoming'}`}
      onContextMenu={handleContextMenu}
      data-id={msg.id}
    >
      {/* Avatar only for incoming messages */}
      {!isOutgoing && (
        <div className={`avatar text-avatar ${sender.avatarClass || 'avatar-purple'} small-avatar`}>
          {sender.letter || ''}
        </div>
      )}

      <div className="message-bubble">
        {parentReplyPreview}

        <div className="message-header">
          <span className="message-sender">
            {isOutgoing ? 'You' : (sender.displayName || '')}
          </span>
          <span className="message-time">
            {formatTimestamp(msg.timestamp)}
          </span>
        </div>

        <div className="message-body">
          {bodyContent}
          {meetingCard}
        </div>

        {attachmentMarkup}

        {/* Reactions List */}
        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
          <div className="reactions-list">
            {Object.entries(msg.reactions).map(([emoji, userIds]) => {
              if (!userIds) return null;
              const hasUserReacted = currentUser?.id && userIds.includes(currentUser.id);
              return (
                <div
                  key={emoji}
                  className={`reaction-badge ${hasUserReacted ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onShowContextMenu(msg.id, e.clientX, e.clientY); }}
                >
                  <span>{emoji}</span>
                  <span className="count">{userIds.length}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Status Indicators */}
        {isOutgoing ? (
          <div className="msg-status-icons">
            {msg.isEdited && <span className="edit-badge">(edited)</span>}
            <i className="fa-solid fa-check-double receipt-icon" title="Processed by Server"></i>
          </div>
        ) : msg.isEdited ? (
          <div className="msg-status-icons">
            <span className="edit-badge">(edited)</span>
          </div>
        ) : null}
      </div>

      {/* Hover Action Bar */}
      <div className="message-actions-bar">
        <button
          title="Reply"
          onClick={(e) => { e.stopPropagation(); onShowContextMenu(msg.id, e.clientX, e.clientY); }}
        >
          <i className="fa-solid fa-reply"></i>
        </button>
        <button
          title="React"
          onClick={(e) => { e.stopPropagation(); onShowContextMenu(msg.id, e.clientX, e.clientY); }}
        >
          <i className="fa-regular fa-face-smile"></i>
        </button>
        <button
          title="More"
          onClick={(e) => { e.stopPropagation(); onShowContextMenu(msg.id, e.clientX, e.clientY); }}
        >
          <i className="fa-solid fa-ellipsis"></i>
        </button>
      </div>
    </div>
  );
}

const areEqual = (prevProps, nextProps) => {
  // Only re-render if the message itself changes, or if the user cache reference changes.
  // We ignore activeChat changes unless the message specifically needs it, 
  // and we ignore callback prop changes assuming they are stable in behavior.
  return prevProps.msg === nextProps.msg &&
         prevProps.currentUser?.id === nextProps.currentUser?.id &&
         prevProps.usersCache === nextProps.usersCache &&
         prevProps.token === nextProps.token &&
         (!nextProps.msg?.parentMessageId || prevProps.activeChat === nextProps.activeChat);
};

export default React.memo(MessageItem, areEqual);
