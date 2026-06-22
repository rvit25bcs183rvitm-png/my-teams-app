import React, { useState } from 'react';

function JoinMeetingModal({ isOpen, onClose, onJoin }) {
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!joinCode.trim()) {
      setError('Please enter a valid Join Code.');
      return;
    }
    setError('');
    onJoin(joinCode.trim());
    setJoinCode('');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Join Meeting</h3>
          <button className="close-btn" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="login-error">{error}</div>}
            <div className="form-group">
              <label htmlFor="joinCode">Meeting Code</label>
              <input
                type="text"
                id="joinCode"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="e.g. 123 456 789"
                autoComplete="off"
                autoFocus
              />
              <small className="help-text">
                Enter the 9-digit code provided by the meeting host.
              </small>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Join</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default JoinMeetingModal;
