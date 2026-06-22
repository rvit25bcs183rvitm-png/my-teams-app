import React, { useState, useEffect } from 'react';

function AddParticipantModal({ isOpen, onClose, onAddMember, usersCache, currentUser }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [availableUsers, setAvailableUsers] = useState([]);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      // Deduplicate users by ID and filter out currentUser
      const uniqueUsers = [];
      const seenIds = new Set();
      Object.values(usersCache || {}).forEach(user => {
        if (user && user.id && user.id !== currentUser?.id && !seenIds.has(user.id)) {
          seenIds.add(user.id);
          uniqueUsers.push(user);
        }
      });
      setAvailableUsers(uniqueUsers);
    }
  }, [isOpen, usersCache, currentUser]);

  if (!isOpen) return null;

  const filteredUsers = availableUsers.filter(u => 
    (u.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.username || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add People</h3>
          <button className="close-btn" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <div className="search-bar">
              <i className="fa-solid fa-search"></i>
              <input 
                type="text" 
                placeholder="Type a name..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          
          <div className="modal-user-list modal-user-list-compact">
            {filteredUsers.length === 0 ? (
              <div className="empty-state">
                No users found.
              </div>
            ) : (
              filteredUsers.map(user => (
                <div 
                  key={user.id} 
                  className="modal-user-item" 
                  onClick={() => { onAddMember(user.id); onClose(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
                >
                  <div className="avatar">
                    <div className="text-avatar">
                      {(user.displayName || '')[0] ? (user.displayName || '')[0].toUpperCase() : ((user.username || '')[0] ? (user.username || '')[0].toUpperCase() : 'U')}
                    </div>
                  </div>
                  <div className="user-info">
                    <div className="user-name">{user.displayName || user.username || ''}</div>
                    <div className="user-username">{user.username || ''}</div>
                  </div>
                  <button className="btn btn-primary btn-sm">Add</button>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default AddParticipantModal;
