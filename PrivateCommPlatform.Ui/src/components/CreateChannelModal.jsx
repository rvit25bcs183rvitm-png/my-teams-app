import { useState } from 'react';

function CreateChannelModal({ isOpen, onClose, onCreate, existingTeams = [] }) {
  const [teamSelection, setTeamSelection] = useState('Command Center');
  const [newTeamName, setNewTeamName] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = () => {
    const finalTeamName = teamSelection === 'new' ? newTeamName.trim() : teamSelection;
    if (!finalTeamName) {
      alert("Team name is required.");
      return;
    }

    const trimmedName = (name || '').trim().toLowerCase();
    if (!trimmedName) {
      alert("Channel name is required.");
      return;
    }

    // Format the channel name as [Team Name] Channel Name
    const formattedChannelName = `[${finalTeamName}] ${trimmedName}`;
    
    onCreate(formattedChannelName, (desc || '').trim(), isPrivate);
    
    // Reset states
    setTeamSelection('Command Center');
    setNewTeamName('');
    setName('');
    setDesc('');
    setIsPrivate(false);
  };

  const handleCancel = () => {
    setTeamSelection('Command Center');
    setNewTeamName('');
    setName('');
    setDesc('');
    setIsPrivate(false);
    onClose();
  };

  return (
    <div className="modal-overlay" id="modal-new-channel" onClick={handleCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create Secure Teams Channel</h3>
          <i className="fa-solid fa-xmark close-btn modal-cancel" onClick={handleCancel}></i>
        </div>
        <div className="modal-body">
          
          {/* Select Team */}
          <div className="form-group">
            <label htmlFor="select-team">Select Team</label>
            <select
              id="select-team"
              value={teamSelection}
              onChange={(e) => setTeamSelection(e.target.value)}
            >
              {existingTeams.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
              <option value="new">+ Create New Team...</option>
            </select>
          </div>

          {/* New Team input box if "new" is selected */}
          {teamSelection === 'new' && (
            <div className="form-group">
              <label htmlFor="new-team-name">New Team Name</label>
              <input
                type="text"
                id="new-team-name"
                placeholder="e.g. Marketing, R&D"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
              />
            </div>
          )}

          {/* Channel Name */}
          <div className="form-group">
            <label htmlFor="new-channel-name">Channel Name</label>
            <input 
              type="text" 
              id="new-channel-name" 
              placeholder="e.g. engineering-sync"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="form-group">
            <label htmlFor="new-channel-desc">Description</label>
            <input 
              type="text" 
              id="new-channel-desc" 
              placeholder="Purpose of this channel"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>

          {/* Private flag */}
          <div className="form-group row">
            <input 
              type="checkbox" 
              id="new-channel-private"
              className="form-checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
            <label htmlFor="new-channel-private" className="form-label-inline">Make Channel Private</label>
          </div>

        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary modal-cancel" onClick={handleCancel}>Cancel</button>
          <button className="btn btn-primary" id="modal-create-channel-confirm" onClick={handleConfirm}>Create</button>
        </div>
      </div>
    </div>
  );
}

export default CreateChannelModal;
