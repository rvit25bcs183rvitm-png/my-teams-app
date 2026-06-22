import { useState, useEffect } from 'react';
import { BASE_URL } from '../config';

export default function TeamsSection({
  currentUser,
  conversations,
  usersCache,
  activeChatId,
  setActiveChatId,
  setActiveTab,
  onSendMessage,
  onStartConference,
  onUploadFile,
  token,
  onRefresh
}) {
  const [selectedChannelId, setSelectedChannelId] = useState(activeChatId || null);
  const [viewingDashboard, setViewingDashboard] = useState(true);
  const [currentSubTab, setCurrentSubTab] = useState('posts'); // 'posts' | 'files' | 'members'
  const [postText, setPostText] = useState('');
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedAddUserId, setSelectedAddUserId] = useState('');
  const [selectedAddRole, setSelectedAddRole] = useState('Employee');

  const [settingsForm, setSettingsForm] = useState({
    postingRestriction: 'AnyMember',
    memberAdditionRestriction: 'AnyMember',
    deleteRestriction: 'OwnOrHigher',
    editRestriction: 'OnlyOwnersAndManagers'
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Accordion state for dashboard
  const [expandedTeams, setExpandedTeams] = useState({});

  const toggleTeamExpand = (teamName) => {
    setExpandedTeams(prev => ({
      ...prev,
      [teamName]: !prev[teamName]
    }));
  };

  // Group channels into Teams
  const channels = Object.values(conversations || {}).filter(c => c && c.type === 'channel');
  
  // Group channels dynamically by Team Name
  const teamsMap = {};
  channels.forEach(c => {
    if (!c) return;
    const cleanName = (c.name || '').replace(/^#\s*/, '');
    const match = cleanName.match(/^\[(.*?)\]\s*(.*)$/);
    let teamName = "";
    let displayName = cleanName;
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
    
    if (!teamsMap[teamName]) {
      teamsMap[teamName] = [];
    }
    teamsMap[teamName].push({
      ...c,
      displayName: displayName
    });
  });

  const teamsList = Object.keys(teamsMap).map(teamName => {
    let teamIcon = "fa-briefcase";
    let teamColor = "#0078d4";
    const teamLower = teamName.toLowerCase();
    
    if (teamLower.includes('command') || teamLower.includes('general') || teamLower.includes('admin')) {
      teamIcon = "fa-shield-halved";
      teamColor = "#6264a7";
    } else if (teamLower.includes('dev') || teamLower.includes('tech') || teamLower.includes('engineering') || teamLower.includes('r&d')) {
      teamIcon = "fa-code";
      teamColor = "#107c41";
    } else if (teamLower.includes('marketing') || teamLower.includes('sales')) {
      teamIcon = "fa-chart-line";
      teamColor = "#d83b01";
    } else if (teamLower.includes('support') || teamLower.includes('help')) {
      teamIcon = "fa-circle-question";
      teamColor = "#8764b8";
    } else if (teamLower.includes('hr') || teamLower.includes('people')) {
      teamIcon = "fa-user-tie";
      teamColor = "#0078d4";
    }

    return {
      name: teamName,
      icon: teamIcon,
      color: teamColor,
      description: `Collaboration workspace for the ${teamName} team.`,
      channels: teamsMap[teamName]
    };
  });

  // Get selected channel and enrich with parsed details
  const selectedChannelRaw = conversations[selectedChannelId];
  let selectedChannel = null;
  if (selectedChannelRaw && selectedChannelRaw.type === 'channel') {
    const cleanName = (selectedChannelRaw.name || '').replace(/^#\s*/, '');
    const match = cleanName.match(/^\[(.*?)\]\s*(.*)$/);
    selectedChannel = {
      ...selectedChannelRaw,
      displayName: match ? match[2] : cleanName,
      teamName: match ? match[1] : (
        cleanName.toLowerCase().includes('general') || cleanName.toLowerCase().includes('announcement') || cleanName.toLowerCase().includes('command')
          ? "Command Center"
          : "Tactical Operations"
      )
    };
  }

  const myMemberInfo = selectedChannel?.memberDetails?.find(m => m.userId === currentUser?.id);
  const isOwnerOrManager = myMemberInfo?.role === 'Owner' || myMemberInfo?.role === 'Manager';
  const memberAdditionRestriction = selectedChannel?.settings?.memberAdditionRestriction || 'AnyMember';

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

  const currentMemberIds = new Set((selectedChannel?.memberDetails || []).map(m => m.userId.toLowerCase()));
  const eligibleUsers = Object.values(usersCache || {}).filter(
    u => u && u.id && !currentMemberIds.has(u.id.toLowerCase()) && u.id.toLowerCase() !== (currentUser?.id || '').toLowerCase()
  );

  useEffect(() => {
    if (activeChatId && conversations[activeChatId]?.type === 'channel') {
      setSelectedChannelId(activeChatId);
      setViewingDashboard(false);
    } else {
      setViewingDashboard(true);
    }
  }, [activeChatId, conversations]);

  useEffect(() => {
    if (selectedChannel && selectedChannel.settings) {
      setSettingsForm({
        postingRestriction: selectedChannel.settings.postingRestriction || 'AnyMember',
        memberAdditionRestriction: selectedChannel.settings.memberAdditionRestriction || 'AnyMember',
        deleteRestriction: selectedChannel.settings.deleteRestriction || 'OwnOrHigher',
        editRestriction: selectedChannel.settings.editRestriction || 'OnlyOwnersAndManagers'
      });
    } else {
      setSettingsForm({
        postingRestriction: 'AnyMember',
        memberAdditionRestriction: 'AnyMember',
        deleteRestriction: 'OwnOrHigher',
        editRestriction: 'OnlyOwnersAndManagers'
      });
    }
  }, [selectedChannel?.id, selectedChannel?.settings]);

  const handleRoleChange = async (targetUserId, newRole) => {
    try {
      const response = await fetch(`${BASE_URL}/api/conversations/${selectedChannelId}/members/${targetUserId}/role`, {
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
    if (!confirm("Are you sure you want to remove this member?")) return;
    try {
      const response = await fetch(`${BASE_URL}/api/conversations/${selectedChannelId}/members/${targetUserId}`, {
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

  const handleAddMember = async () => {
    if (!selectedAddUserId) return;
    try {
      const response = await fetch(`${BASE_URL}/api/conversations/${selectedChannelId}/members`, {
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
  };

  const handlePostMessage = (e) => {
    e.preventDefault();
    if (!postText.trim() || !selectedChannelId) return;

    setActiveChatId(selectedChannelId);
    onSendMessage(postText);
    setPostText('');
  };

  const handleUpdateSettings = async (e) => {
    e.preventDefault();
    if (!selectedChannelId || !settingsForm) return;
    setIsSavingSettings(true);
    try {
      const response = await fetch(`${BASE_URL}/api/conversations/${selectedChannelId}/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(settingsForm)
      });
      if (response.ok) {
        alert("Settings updated successfully!");
        if (onRefresh) onRefresh();
      } else {
        const err = await response.json();
        alert(`Failed to update settings: ${err.error || response.statusText}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error updating settings.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleMeetNow = () => {
    if (!selectedChannel) return;
    onStartConference({
      id: selectedChannel.id,
      displayName: `${selectedChannel.teamName} - ${selectedChannel.displayName} Meeting`,
      isVideo: true,
      isGroup: true
    });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && selectedChannelId) {
      setActiveChatId(selectedChannelId);
      onUploadFile(file);
    }
  };

  const sharedFiles = selectedChannel?.messages
    ?.filter(m => m.attachment)
    ?.map(m => ({
      id: m.id,
      fileName: m.attachment.fileName,
      fileSize: m.attachment.fileSize,
      senderId: m.senderId,
      timestamp: m.timestamp,
      storagePath: m.attachment.storagePath
    })) || [];

  return (
    <div className="teams-section-container">

      {viewingDashboard || !selectedChannel ? (
        <div className="teams-dashboard" style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          <div className="teams-dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', background: 'var(--bg-surface)', padding: '32px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            <div>
              <h2 style={{ fontSize: '2rem', fontWeight: 700, margin: '0 0 12px 0', color: 'var(--text-primary)' }}>Your Teams</h2>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '1.1rem' }}>Collaborate with members in channels, share files, and hold instant meetings.</p>
            </div>
            <button 
              onClick={() => {
                const addBtn = document.getElementById('add-channel-btn');
                if (addBtn) addBtn.click();
              }}
              className="btn btn-primary"
              style={{ padding: '12px 24px', fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <i className="fa-solid fa-plus icon"></i> Join or Create Channel
            </button>
          </div>

          <div className="teams-accordion-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '24px' }}>
            {teamsList.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-color)', gridColumn: '1 / -1' }}>
                <div style={{ marginBottom: '1.5rem', color: 'var(--primary)', opacity: 0.8 }}>
                  <i className="fa-solid fa-people-group" style={{ fontSize: '4.5rem' }}></i>
                </div>
                <h3 style={{ fontSize: '1.5rem', marginBottom: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Teams Found</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2.5rem', maxWidth: '400px', fontSize: '1.1rem', lineHeight: '1.5' }}>
                  Teams are where your group comes together to collaborate, share files, and communicate efficiently.
                </p>
                <button 
                  onClick={() => document.getElementById('add-channel-btn')?.click()}
                  className="btn btn-primary"
                  style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}
                >
                  <i className="fa-solid fa-plus icon"></i> Create Your First Team
                </button>
              </div>
            ) : (
              teamsList.map(team => {
                const isExpanded = expandedTeams[team.name] !== false; // default expanded

                return (
                  <div key={team.name} className="team-accordion-card" style={{ background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'transform 0.2s, box-shadow 0.2s' }}>
                    <div 
                      className="team-accordion-header"
                      onClick={() => toggleTeamExpand(team.name)}
                      style={{ padding: '24px', cursor: 'pointer', borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)' }}
                    >
                      <div className="team-accordion-title" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div className="team-icon-box" style={{ backgroundColor: team.color, width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.2rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                          <i className={`fa-solid ${team.icon}`}></i>
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)' }}>{team.name}</h3>
                          <span className="team-channel-count" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{team.channels.length} channels</span>
                        </div>
                      </div>
                      <i className={`fa-solid fa-chevron-${isExpanded ? 'up' : 'down'} expand-icon`} style={{ color: 'var(--text-muted)' }}></i>
                    </div>

                    {isExpanded && (
                      <div className="team-accordion-body" style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <p className="team-description" style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '20px', lineHeight: 1.5 }}>{team.description}</p>
                        
                        <div className="team-channels-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {team.channels.map(ch => (
                            <div 
                              key={ch.id} 
                              onClick={() => {
                                setSelectedChannelId(ch.id);
                                setActiveChatId(ch.id);
                                setViewingDashboard(false);
                              }}
                              className="team-channel-item"
                              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.03)', transition: 'background 0.2s', color: 'var(--text-primary)', fontWeight: 500 }}
                            >
                              <i className="fa-solid fa-hashtag icon" style={{ color: 'var(--text-muted)' }}></i>
                              <span>{ch.displayName}</span>
                            </div>
                          ))}
                          {team.channels.length === 0 && (
                            <span className="empty-state-text" style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', padding: '8px 0' }}>No channels created yet.</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="channel-viewport">
          <div className="channel-header">
            <div className="channel-header-title">
              <button 
                onClick={() => setViewingDashboard(true)}
                className="btn btn-secondary back-btn"
                title="Back to All Teams"
              >
                <i className="fa-solid fa-arrow-left"></i>
                <span>All Teams</span>
              </button>
              <div className="channel-breadcrumbs">
                <div className="breadcrumb">
                  <span>{selectedChannel.teamName}</span>
                  <i className="fa-solid fa-chevron-right icon"></i>
                </div>
                <h3>
                  <i className="fa-solid fa-hashtag icon"></i>
                  {selectedChannel.displayName}
                </h3>
              </div>
            </div>

            <div className="channel-header-actions">
              <button onClick={handleMeetNow} className="btn btn-primary">
                <i className="fa-solid fa-video icon"></i> Meet Now
              </button>
              <button 
                onClick={() => {
                  setActiveChatId(selectedChannel.id);
                  setActiveTab('chat');
                }}
                className="btn btn-secondary"
              >
                Open in Chat
              </button>
            </div>
          </div>

          <div className="channel-sub-tabs">
            {[
              { id: 'posts', label: 'Posts', icon: 'fa-comments' },
              { id: 'files', label: 'Files', icon: 'fa-file-lines' },
              { id: 'calendar', label: 'Calendar', icon: 'fa-calendar-days' },
              { id: 'members', label: 'Members', icon: 'fa-users' },
              ...(isOwnerOrManager ? [{ id: 'settings', label: 'Settings', icon: 'fa-gear' }] : [])
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setCurrentSubTab(tab.id)}
                className={`sub-tab-btn ${currentSubTab === tab.id ? 'active' : ''}`}
              >
                <i className={`fa-solid ${tab.icon} icon`}></i> {tab.label}
              </button>
            ))}
          </div>

          <div className="channel-sub-tab-content">
            
            {/* SUB-TAB 1: POSTS */}
            {currentSubTab === 'posts' && (
              <div className="channel-posts-container">
                <div className="channel-messages-list">
                  {selectedChannel.messages && selectedChannel.messages.map(msg => {
                    const sender = usersCache[msg.senderId] || { displayName: 'User', letter: 'U', avatarClass: 'avatar-purple' };

                    return (
                      <div key={msg.id} className="channel-message-item">
                        <div className={`avatar text-avatar ${sender.avatarClass}`}>
                          {sender.letter}
                        </div>
                        <div className="message-content-wrapper">
                          <div className="message-header">
                            <span className="sender-name">{sender.displayName}</span>
                            <span className="message-time">
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          
                          <div className="message-text">
                            {msg.content}
                          </div>

                          {msg.attachment && (
                            <div 
                              onClick={() => window.open(msg.attachment.storagePath)}
                              className="message-attachment"
                            >
                              <i className="fa-solid fa-file-arrow-down icon"></i>
                              <div className="attachment-filename">
                                {msg.attachment.fileName}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {(!selectedChannel.messages || selectedChannel.messages.length === 0) && (
                    <div className="empty-state">
                      No posts in this channel yet. Start the conversation below.
                    </div>
                  )}
                </div>

                <form onSubmit={handlePostMessage} className="channel-compose-form">
                  <input 
                    type="text"
                    value={postText}
                    onChange={(e) => setPostText(e.target.value)}
                    placeholder={`Start a new post in #${selectedChannel.displayName}...`}
                    className="compose-input"
                  />

                  <input 
                    type="file" 
                    id="channel-file-upload" 
                    onChange={handleFileChange}
                    className="hidden-file-input"
                  />
                  <button 
                    type="button"
                    onClick={() => document.getElementById('channel-file-upload').click()}
                    className="btn btn-secondary compose-attach-btn"
                    title="Upload File"
                  >
                    <i className="fa-solid fa-paperclip"></i>
                  </button>

                  <button type="submit" className="btn btn-primary compose-submit-btn">
                    Post
                  </button>
                </form>
              </div>
            )}

            {/* SUB-TAB 2: FILES */}
            {currentSubTab === 'files' && (
              <div className="channel-files-container">
                <h4>Shared files in this channel</h4>
                
                <div className="shared-files-list">
                  {sharedFiles.map(file => (
                    <div key={file.id} className="shared-file-item">
                      <div className="file-info">
                        <i className="fa-solid fa-file-lines file-icon"></i>
                        <div className="file-details">
                          <div className="file-name">{file.fileName}</div>
                          <div className="file-meta">
                            {(file.fileSize / 1024).toFixed(1)} KB • Uploaded by {(usersCache[file.senderId]?.displayName || usersCache[file.senderId]?.username || 'User')}
                          </div>
                        </div>
                      </div>
                      <a href={file.storagePath} download className="btn btn-secondary download-btn">
                        <i className="fa-solid fa-download"></i> Download
                      </a>
                    </div>
                  ))}

                  {sharedFiles.length === 0 && (
                    <div className="empty-state">
                      No files shared in this channel yet.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUB-TAB: CALENDAR */}
            {currentSubTab === 'calendar' && (
              <div className="channel-calendar-container" style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <h4 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>Channel Calendar</h4>
                  <button className="btn btn-primary">
                    <i className="fa-solid fa-plus icon"></i> New Event
                  </button>
                </div>
                
                <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    <i className="fa-regular fa-calendar-xmark"></i>
                  </div>
                  <h5 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>No upcoming events</h5>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>Schedule meetings and team events here.</p>
                </div>
              </div>
            )}

            {/* SUB-TAB: MEMBERS */}
            {currentSubTab === 'members' && (
              <div className="channel-members-container">
                <div className="members-header">
                  <h4>Channel Members ({selectedChannel.memberDetails?.length || 0})</h4>
                  {canAddMembers && (
                    <button 
                      onClick={() => setShowAddMemberModal(true)}
                      className="btn btn-primary"
                    >
                      <i className="fa-solid fa-user-plus icon"></i> Add Member
                    </button>
                  )}
                </div>

                <div className="members-grid">
                  {selectedChannel.memberDetails && selectedChannel.memberDetails.map(mem => {
                    const cacheInfo = usersCache[mem.userId.toLowerCase()] || {};
                    const isSelf = mem.userId === currentUser?.id;
                    const isTargetOwner = mem.role === 'Owner';
                    const canManageRole = isOwnerOrManager && (!isTargetOwner || isSelf) && (myMemberInfo?.role === 'Owner' || mem.role !== 'Owner');

                    return (
                      <div key={mem.userId} className="member-card">
                        <div className="member-info">
                          <div className="avatar-wrapper">
                            <div className={`avatar text-avatar ${cacheInfo.avatarClass || 'avatar-purple'}`}>
                              {cacheInfo.letter || (mem.username || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div className={`status-badge ${(cacheInfo.status || 'offline').toLowerCase()}`}></div>
                          </div>
                          <div className="member-details">
                            <div className="member-name">
                              {(mem.displayName || mem.username)} {isSelf && " (You)"}
                            </div>
                            <div className="member-role">{mem.role || 'Member'}</div>
                          </div>
                        </div>

                        {!isSelf && (
                          <div className="member-actions">
                            {canManageRole && (
                              <select 
                                value={mem.role}
                                onChange={(e) => handleRoleChange(mem.userId, e.target.value)}
                                className="role-select"
                              >
                                <option value="Owner">Owner</option>
                                <option value="Manager">Manager</option>
                                <option value="Employee">Employee</option>
                                <option value="Guest">Guest</option>
                              </select>
                            )}
                            {isOwnerOrManager && !isTargetOwner && (
                              <button 
                                onClick={() => handleKickMember(mem.userId)}
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
              </div>
            )}

            {/* SUB-TAB 4: SETTINGS */}
            {currentSubTab === 'settings' && isOwnerOrManager && (
              <div className="channel-settings-container" style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
                <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                  <h3 style={{ margin: '0 0 24px 0', fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>Channel Settings</h3>
                  <form onSubmit={handleUpdateSettings} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Who can post messages?</label>
                      <select 
                        value={settingsForm?.postingRestriction || 'AnyMember'}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, postingRestriction: e.target.value }))}
                        className="form-control"
                        style={{ padding: '12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      >
                        <option value="AnyMember">Any Member</option>
                        <option value="OnlyOwnersAndManagers">Only Owners & Managers</option>
                        <option value="OnlyOwners">Only Owners</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Who can add new members?</label>
                      <select 
                        value={settingsForm?.memberAdditionRestriction || 'AnyMember'}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, memberAdditionRestriction: e.target.value }))}
                        className="form-control"
                        style={{ padding: '12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      >
                        <option value="AnyMember">Any Member</option>
                        <option value="OnlyOwnersAndManagers">Only Owners & Managers</option>
                        <option value="OnlyOwners">Only Owners</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Who can delete messages?</label>
                      <select 
                        value={settingsForm?.deleteRestriction || 'OwnOrHigher'}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, deleteRestriction: e.target.value }))}
                        className="form-control"
                        style={{ padding: '12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      >
                        <option value="OwnOrHigher">Their Own or Anyone Lower</option>
                        <option value="OnlyOwnersAndManagers">Only Owners & Managers</option>
                        <option value="OnlyOwners">Only Owners</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Who can edit messages?</label>
                      <select 
                        value={settingsForm?.editRestriction || 'OnlyOwnersAndManagers'}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, editRestriction: e.target.value }))}
                        className="form-control"
                        style={{ padding: '12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      >
                        <option value="OwnOnly">Their Own Messages Only</option>
                        <option value="OnlyOwnersAndManagers">Only Owners & Managers</option>
                        <option value="OnlyOwners">Only Owners</option>
                      </select>
                    </div>

                    <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="submit" className="btn btn-primary" disabled={isSavingSettings} style={{ padding: '12px 24px', fontSize: '1.05rem', fontWeight: 600 }}>
                        {isSavingSettings ? 'Saving...' : 'Save Settings'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {showAddMemberModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Add Member</h3>
              <i className="fa-solid fa-xmark close-btn" onClick={() => { setShowAddMemberModal(false); setSelectedAddUserId(''); }}></i>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Select User</label>
                <select 
                  value={selectedAddUserId}
                  onChange={(e) => setSelectedAddUserId(e.target.value)}
                  className="user-select"
                >
                  <option value="">-- Choose User --</option>
                  {eligibleUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.displayName || u.username} (@{u.username})
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
                    className="role-select"
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
                onClick={handleAddMember}
              >
                Add Member
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
