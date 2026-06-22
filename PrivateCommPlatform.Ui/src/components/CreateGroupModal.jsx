import { useState } from 'react';

function CreateGroupModal({ isOpen, onClose, onCreate, usersCache, currentUser }) {
  const [name, setName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState([]);

  if (!isOpen) return null;

  // Filter out the current user from the list (case-insensitive to handle GUID casing differences)
  const uniqueUsersMap = {};
  Object.values(usersCache || {}).forEach(u => {
    if (u && u.id) {
      uniqueUsersMap[u.id.toLowerCase()] = u;
    }
  });
  const eligibleUsers = Object.values(uniqueUsersMap).filter(
    (u) => u.id.toLowerCase() !== (currentUser?.id || '').toLowerCase()
  );

  const toggleUserSelection = (userId) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleConfirm = () => {
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      alert("Group name is required.");
      return;
    }
    if (selectedUserIds.length === 0) {
      alert("Please select at least one user to add to the group.");
      return;
    }
    onCreate(trimmedName, selectedUserIds);
    // Reset state
    setName('');
    setSelectedUserIds([]);
  };

  const handleCancel = () => {
    setName('');
    setSelectedUserIds([]);
    onClose();
  };

  return (
    <div className="modal-overlay" id="modal-new-group" onClick={handleCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create Group Chat</h3>
          <i className="fa-solid fa-xmark close-btn modal-cancel" onClick={handleCancel}></i>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="new-group-name">Group Name</label>
            <input 
              type="text" 
              id="new-group-name" 
              placeholder="e.g. Project Alpha Sync"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Add Members</label>
            <div className="modal-user-list modal-user-list-compact">
              {eligibleUsers.map(u => {
                if (!u) return null;
                const isSelected = selectedUserIds.includes(u.id);
                return (
                  <div 
                    key={u.id} 
                    className={`modal-user-item ${isSelected ? 'active' : ''}`}
                    onClick={() => toggleUserSelection(u.id)}
                  >
                    <div className="modal-user-item-wrapper">
                      <div className="modal-user-item-content">
                        <div className={`avatar text-avatar ${u.avatarClass || ''}`}>
                          {u.letter || ''}
                        </div>
                        <div className="modal-user-info">
                          <span className="modal-user-name">
                            {u.displayName || ''}
                          </span>
                          <span className="modal-user-username">
                            @{u.username || ''}
                          </span>
                        </div>
                      </div>
                      <div>
                        <input 
                          type="checkbox" 
                          className="form-checkbox"
                          checked={isSelected}
                          onChange={() => {}} // Handled by outer div click
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              {eligibleUsers.length === 0 && (
                <div className="empty-state">
                  No other users available.
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary modal-cancel" onClick={handleCancel}>Cancel</button>
          <button 
            className="btn btn-primary" 
            id="modal-create-group-confirm" 
            onClick={handleConfirm}
            disabled={!(name || '').trim() || selectedUserIds.length === 0}
          >
            Create Group
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateGroupModal;
