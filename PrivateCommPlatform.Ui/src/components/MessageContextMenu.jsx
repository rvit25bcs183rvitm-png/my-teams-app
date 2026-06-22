import React from 'react';

function MessageContextMenu({
  menuState,
  onClose,
  activeChat,
  currentUser,
  usersCache,
  onReply,
  onEdit,
  onDelete,
  onReact
}) {
  if (!menuState.visible || !activeChat) return null;

  const msg = activeChat.messages.find(m => m.id === menuState.messageId);
  if (!msg) return null;

  const isMine = msg.senderId === currentUser?.id;

  const handleReactionClick = (emoji) => {
    onReact(msg.id, emoji);
    onClose();
  };

  const handleReplyClick = () => {
    onReply(msg.id);
    onClose();
  };

  const handleEditClick = () => {
    onEdit(msg.id);
    onClose();
  };

  const handleDeleteEveryone = () => {
    onDelete(msg.id, "Everyone");
    onClose();
  };

  const handleDeleteSelf = () => {
    onDelete(msg.id, "Self");
    onClose();
  };

  const menuPositionStyle = {
    left: `${menuState.x || 0}px`,
    top: `${menuState.y || 0}px`
  };

  return (
    <div className="context-menu-overlay" id="message-context-menu" onClick={onClose}>
      <div
        className="context-menu"
        id="context-menu-box"
        style={menuPositionStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="quick-reactions">
          {['👍', '❤️', '😂', '😮', '🎉', '👏'].map(emoji => (
            <span
              key={emoji}
              className="reaction-emoji"
              onClick={() => handleReactionClick(emoji)}
            >
              {emoji}
            </span>
          ))}
        </div>

        <div className="context-item" id="context-reply" onClick={handleReplyClick}>
          <i className="fa-solid fa-reply"></i>
          <span>Reply</span>
        </div>

        {isMine && !msg.isDeleted && (
          <>
            <div className="context-item" id="context-edit" onClick={handleEditClick}>
              <i className="fa-solid fa-pen"></i>
              <span>Edit (15m limit)</span>
            </div>
            <div className="context-item danger" id="context-delete-everyone" onClick={handleDeleteEveryone}>
              <i className="fa-solid fa-trash-can"></i>
              <span>Delete for Everyone</span>
            </div>
          </>
        )}

        <div className="context-item warning" id="context-delete-self" onClick={handleDeleteSelf}>
          <i className="fa-solid fa-eye-slash"></i>
          <span>Delete for Me Only</span>
        </div>
      </div>
    </div>
  );
}

export default MessageContextMenu;
