import React, { useState, useEffect } from 'react';
import { BASE_URL } from '../config';


function ChatDetails({ activeChat, usersCache, currentUser, token, onRefresh, onClose, onDownloadFile, onStartGroupCall }) {
  const [membersExpanded, setMembersExpanded] = useState(true);
  const [filesExpanded, setFilesExpanded] = useState(true);
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedAddUserId, setSelectedAddUserId] = useState('');
  const [selectedAddRole, setSelectedAddRole] = useState('Employee');

  // Settings states
  const [postingRestriction, setPostingRestriction] = useState('AnyMember');
  const [memberAdditionRestriction, setMemberAdditionRestriction] = useState('AnyMember');
  const [deleteRestriction, setDeleteRestriction] = useState('OwnOrHigher');
  const [editRestriction, setEditRestriction] = useState('OnlyOwnersAndManagers');

  // Load settings when activeChat changes or onmount
  useEffect(() => {
    if (activeChat?.settings) {
      setPostingRestriction(activeChat.settings.postingRestriction || 'AnyMember');
      setMemberAdditionRestriction(activeChat.settings.memberAdditionRestriction || 'AnyMember');
      setDeleteRestriction(activeChat.settings.deleteRestriction || 'OwnOrHigher');
      setEditRestriction(activeChat.settings.editRestriction || 'OnlyOwnersAndManagers');
    }
  }, [activeChat]);

  if (!activeChat) return null;

  // Compile shared attachments from messages list
  const sharedAttachments = (activeChat.messages || [])
    .filter(m => {
      if (!m) return false;
      const type = (m.type || '').toLowerCase();
      const attachment = m.attachment || (m.attachments && m.attachments[0]) || (m.Attachments && m.Attachments[0]);
      if (!attachment) return false;
      const fileName = attachment.fileName || attachment.FileName || '';
      const content = m.content || m.Content || '';
      const isVoicemail = type === 'attachment' && (
        fileName.startsWith('voicemail-') || content.startsWith('voicemail-')
      );
      return !isVoicemail;
    })
    .map(m => m.attachment || (m.attachments && m.attachments[0]) || (m.Attachments && m.Attachments[0]));

  const myMemberInfo = (activeChat.memberDetails || [])?.find(m => m.userId === currentUser?.id);
  const isOwnerOrManager = myMemberInfo?.role === 'Owner' || myMemberInfo?.role === 'Manager';

  let canAddMembers = false;
  if (myMemberInfo) {
    if (myMemberInfo.role === 'Owner') {
      canAddMembers = true;
    } else if (myMemberInfo.role === 'Manager') {
      canAddMembers = memberAdditionRestriction !== 'OnlyOwners';
    } else if (myMemberInfo.role === 'Employee') {
      canAddMembers = memberAdditionRestriction === 'AnyMember';
    }
  }

  const currentMemberIds = new Set((activeChat.memberDetails || []).map(m => m.userId.toLowerCase()));
  const eligibleUsers = Object.values(usersCache || {}).filter(
    u => u && u.id && !currentMemberIds.has(u.id.toLowerCase()) && u.id.toLowerCase() !== (currentUser?.id || '').toLowerCase()
  );

  const handleSaveSettings = async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/conversations/${activeChat.id}/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          postingRestriction,
          memberAdditionRestriction,
          deleteRestriction,
          editRestriction
        })
      });

      if (response.ok) {
        alert("Conversation settings updated successfully!");
        if (onRefresh) onRefresh();
      } else {
        const errData = await response.json();
        alert(`Failed to save settings: ${errData.error || response.statusText}`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to update settings.");
    }
  };

  const handleRoleChange = async (targetUserId, newRole) => {
    try {
      const response = await fetch(`${BASE_URL}/api/conversations/${activeChat.id}/members/${targetUserId}/role`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      });

      if (response.ok) {
        alert("Member role updated successfully!");
        if (onRefresh) onRefresh();
      } else {
        const errData = await response.json();
        alert(`Failed to update role: ${errData.error || response.statusText}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error updating role.");
    }
  };

  const handleKickMember = async (targetUserId) => {
    if (!confirm("Are you sure you want to remove this member from the conversation?")) return;
    try {
      const response = await fetch(`${BASE_URL}/api/conversations/${activeChat.id}/members/${targetUserId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (response.ok) {
        alert("Member removed successfully!");
        if (onRefresh) onRefresh();
      } else {
        const errData = await response.json();
        alert(`Failed to remove member: ${errData.error || response.statusText}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error removing member.");
    }
  };

  return (
    <aside className="chat-details-panel" id="chat-details-panel">
      {/* ── Panel Header ── */}
      <div className="panel-header">
        <h3>Details</h3>
        <button className="icon-btn" id="details-close" onClick={onClose} title="Close panel">
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      {/* ── Panel Body ── */}
      <div className="panel-body">

        {/* ── Info Card ── */}
        <div className="info-card">
          <div className="info-card-top">
            <div className="avatar text-avatar avatar-purple profile-avatar-large">
              {(activeChat.name || 'C').charAt(0).toUpperCase()}
            </div>
            <h4 className="profile-username" id="details-panel-title">{activeChat.name || ''}</h4>
            <span className="profile-email" id="details-panel-desc">{activeChat.description || ''}</span>
            <span className="badge badge-type">{(activeChat.type || 'channel')}</span>
          </div>

          {activeChat.parent && (
            <div className="info-card-inherited">
              <i className="fa-solid fa-sitemap"></i>
              <span>Inherited from: {(activeChat.parent || {}).name || ''}</span>
            </div>
          )}

          {(activeChat.type || '') !== 'dm' && onStartGroupCall && (
            <button
              className="btn btn-primary btn-full-width btn-group-call"
              onClick={() => onStartGroupCall(activeChat.id)}
            >
              <i className="fa-solid fa-video"></i> Start Group Call
            </button>
          )}
        </div>

        {/* ── Channel Settings Accordion ── */}
        {(activeChat.type || '') !== 'dm' && (
          <div className="accordion-section">
            <div className="accordion-header" onClick={() => setSettingsExpanded(prev => !prev)}>
              <span>Channel Settings</span>
              <i className={`fa-solid ${settingsExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}`}></i>
            </div>
            {settingsExpanded && (
              <div className="accordion-body">
                <div className="form-group">
                  <label>Posting Restrictions</label>
                  <select
                    value={postingRestriction}
                    onChange={(e) => setPostingRestriction(e.target.value)}
                    disabled={!isOwnerOrManager}
                  >
                    <option value="AnyMember">Any Member (Standard)</option>
                    <option value="OnlyOwnersAndManagers">Only Owners &amp; Managers (Announcements)</option>
                    <option value="OnlyOwners">Only Owners</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Member Add Restrictions</label>
                  <select
                    value={memberAdditionRestriction}
                    onChange={(e) => setMemberAdditionRestriction(e.target.value)}
                    disabled={!isOwnerOrManager}
                  >
                    <option value="AnyMember">Any Member</option>
                    <option value="OnlyOwnersAndManagers">Only Owners &amp; Managers</option>
                    <option value="OnlyOwners">Only Owners</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Delete Restrictions</label>
                  <select
                    value={deleteRestriction}
                    onChange={(e) => setDeleteRestriction(e.target.value)}
                    disabled={!isOwnerOrManager}
                  >
                    <option value="OwnOrHigher">Own Message or Higher Role</option>
                    <option value="OnlyOwnersAndManagers">Only Owners &amp; Managers</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Edit Restrictions</label>
                  <select
                    value={editRestriction}
                    onChange={(e) => setEditRestriction(e.target.value)}
                    disabled={!isOwnerOrManager}
                  >
                    <option value="OnlyOwnersAndManagers">Only Owners &amp; Managers</option>
                    <option value="OnlyOwners">Only Owners</option>
                  </select>
                </div>

                {isOwnerOrManager && (
                  <button
                    onClick={handleSaveSettings}
                    className="btn btn-primary btn-full-width"
                  >
                    Save Settings
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Members Accordion ── */}
        <div className="accordion-section">
          <div className="accordion-header" onClick={() => setMembersExpanded(prev => !prev)}>
            <span>Members ({(activeChat.memberDetails || activeChat.members || []).length})</span>
            <div className="accordion-header-actions">
              {canAddMembers && (activeChat.type || '') !== 'dm' && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => { e.stopPropagation(); setShowAddMemberModal(true); }}
                >
                  <i className="fa-solid fa-user-plus"></i> Add
                </button>
              )}
              <i className={`fa-solid ${membersExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}`}></i>
            </div>
          </div>
          {membersExpanded && (
            <div className="member-list" id="details-members-list">
              {(activeChat.memberDetails || []).map((m) => {
                if (!m) return null;
                const isTargetOwner = (m.role || '') === 'Owner';
                const isSelf = (m.userId || '') === (currentUser?.id || '');
                // Owner can demote anyone. Manager can demote managers, employees, guests. Manager CANNOT demote/kick Owner.
                const canManageRole = isOwnerOrManager && (!isTargetOwner || isSelf) && (myMemberInfo?.role === 'Owner' || (m.role || '') !== 'Owner');

                return (
                  <div key={m.userId || ''} className="member-list-item">
                    <div className="avatar text-avatar avatar-purple small-avatar">
                      {((m.displayName || 'U').charAt(0) || '').toUpperCase()}
                    </div>
                    <div className="member-info">
                      <span className="member-name">
                        {m.displayName || ''}
                      </span>
                      <span className="member-role">
                        {m.role || ''} {isSelf && "(You)"}
                      </span>
                    </div>

                    {(activeChat.type || '') !== 'dm' && !isSelf && (
                      <div className="member-actions">
                        {canManageRole && (
                          <select
                            value={m.role || ''}
                            onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                            className="member-role-select"
                          >
                            <option value="Owner">Owner</option>
                            <option value="Manager">Manager</option>
                            <option value="Employee">Employee</option>
                            <option value="Guest">Guest</option>
                          </select>
                        )}
                        {isOwnerOrManager && !isTargetOwner && (
                          <button
                            onClick={() => handleKickMember(m.userId)}
                            className="icon-btn delete-btn"
                            title="Remove Member"
                          >
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Shared Attachments Accordion ── */}
        <div className="accordion-section">
          <div className="accordion-header" onClick={() => setFilesExpanded(prev => !prev)}>
            <span>Shared Attachments ({(sharedAttachments || []).length})</span>
            <i className={`fa-solid ${filesExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}`}></i>
          </div>
          {filesExpanded && (
            <div className="shared-files-list" id="details-files-list">
              {(sharedAttachments || []).map((file) => {
                if (!file) return null;
                return (
                  <div key={file.id || ''} className="file-item">
                    <i className="fa-solid fa-file-pdf attachment-icon"></i>
                    <div className="file-details">
                      <span className="file-title">{file.fileName || ''}</span>
                      <span className="file-meta">
                        {(((file.fileSize || 0)) / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <button
                      className="icon-btn attachment-download-btn"
                      onClick={() => onDownloadFile(file.fileName || '', file.id || '')}
                      title="Download"
                    >
                      <i className="fa-solid fa-download"></i>
                    </button>
                  </div>
                );
              })}
              {(sharedAttachments || []).length === 0 && (
                <div className="empty-state">No shared files</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Add Member Modal ── */}
      {showAddMemberModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Add Member</h3>
              <button className="icon-btn" onClick={() => { setShowAddMemberModal(false); setSelectedAddUserId(''); }}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Select User</label>
                <select
                  value={selectedAddUserId}
                  onChange={(e) => setSelectedAddUserId(e.target.value)}
                >
                  <option value="">-- Choose User --</option>
                  {(eligibleUsers || []).map(u => (
                    <option key={u.id || ''} value={u.id || ''}>
                      {u.displayName || ''} (@{u.username || ''})
                    </option>
                  ))}
                </select>
              </div>

              {isOwnerOrManager && (
                <div className="form-group">
                  <label>Assign Role</label>
                  <select
                    value={selectedAddRole}
                    onChange={(e) => setSelectedAddRole(e.target.value)}
                  >
                    <option value="Employee">Employee (Member)</option>
                    <option value="Manager">Manager</option>
                    <option value="Guest">Guest</option>
                    {myMemberInfo?.role === 'Owner' && (
                      <option value="Owner">Owner</option>
                    )}
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => { setShowAddMemberModal(false); setSelectedAddUserId(''); }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!selectedAddUserId}
                onClick={async () => {
                  try {
                    const response = await fetch(`${BASE_URL}/api/conversations/${activeChat.id}/members`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                      },
                      body: JSON.stringify({
                        userId: selectedAddUserId,
                        role: isOwnerOrManager ? selectedAddRole : 'Employee'
                      })
                    });

                    if (response.ok) {
                      alert("Member added successfully!");
                      setShowAddMemberModal(false);
                      setSelectedAddUserId('');
                      setSelectedAddRole('Employee');
                      if (onRefresh) onRefresh();
                    } else {
                      const errData = await response.json();
                      alert(`Failed to add member: ${errData.error || response.statusText}`);
                    }
                  } catch (e) {
                    console.error(e);
                    alert("Error adding member.");
                  }
                }}
              >
                Add Member
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

export default ChatDetails;
