import { useState } from 'react';

function CreateDmModal({ isOpen, onClose, onCreate, usersCache, currentUser }) {
  const [selectedUserId, setSelectedUserId] = useState(null);

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

  const handleConfirm = () => {
    if (!selectedUserId) {
      alert("Please select a user to message.");
      return;
    }
    onCreate(selectedUserId);
    setSelectedUserId(null);
  };

  const handleCancel = () => {
    setSelectedUserId(null);
    onClose();
  };

  return (
    <div className="modal-overlay" id="modal-new-dm" onClick={handleCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Direct Message</h3>
          <i className="fa-solid fa-xmark close-btn modal-cancel" onClick={handleCancel}></i>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Select recipient</label>
            <div className="modal-user-list">
              {eligibleUsers.map(u => {
                if (!u) return null;
                const isSelected = selectedUserId === u.id;
                return (
                  <div 
                    key={u.id} 
                    className={`modal-user-item ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedUserId(u.id)}
                  >
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
          <button className="btn btn-primary" id="modal-create-dm-confirm" onClick={handleConfirm} disabled={!selectedUserId}>
            Start Chat
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateDmModal;
