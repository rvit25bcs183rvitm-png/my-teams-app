import { useState } from 'react';

function Sidebar({
  currentUser,
  conversations,
  activeChatId,
  setActiveChatId,
  usersCache,
  presenceStatus,
  onPresenceChange,
  filterKeyword,
  setFilterKeyword,
  mobileSidebarActive,
  setMobileSidebarActive,
  onLogout,
  onAddChannel,
  onAddDm,
  onAddGroup,
  activeTab,
  onOpenProfileDrawer,
  favoriteConvIds = [],
  onToggleFavorite,
  callSubTab = 'recent',
  setCallSubTab,
  onStartConference,
  onStartDirectMessage
}) {
  const [collapsedTeams, setCollapsedTeams] = useState({});

  const toggleTeamCollapse = (teamName) => {
    setCollapsedTeams(prev => ({
      ...prev,
      [teamName]: !prev[teamName]
    }));
  };

  const handleConversationClick = (id) => {
    setActiveChatId(id);
    setMobileSidebarActive(false);
  };

  const getOtherUserPresence = (conv) => {
    if (!conv || conv.type !== 'dm' || !currentUser) return 'offline';
    const otherUsername = (conv.members || []).find(name => name !== currentUser.username);
    if (!otherUsername) return 'offline';
    
    const otherUser = Object.values(usersCache || {}).find(u => u && u.username === otherUsername);
    return otherUser?.status || 'Offline';
  };

  const filteredConvs = Object.values(conversations || {}).filter(conv => {
    if (!conv) return false;
    if (!filterKeyword) return true;
    return (conv.name || '').toLowerCase().includes(filterKeyword.toLowerCase());
  });

  const channels = filteredConvs.filter(c => c && c.type === 'channel');
  const dms = filteredConvs.filter(c => c && c.type === 'dm');
  const groups = filteredConvs.filter(c => c && c.type === 'group');

  // Unique contacts list excluding current user
  const uniqueContactsMap = {};
  Object.values(usersCache || {}).forEach(u => {
    if (u && u.id) {
      uniqueContactsMap[u.id.toLowerCase()] = u;
    }
  });
  const allContacts = Object.values(uniqueContactsMap).filter(
    u => u && u.id && u.id.toLowerCase() !== (currentUser?.id || '').toLowerCase()
  );

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

  // Compile favorites
  const favorites = filteredConvs.filter(c => c && favoriteConvIds.includes(c.id));

  // Compiled activity list for Sidebar activity preview
  const activityFeed = [];
  Object.values(conversations || {}).forEach(conv => {
    if (!conv) return;
    activityFeed.push({
      id: `create-${conv.id}`,
      title: `Room created: ${conv.name || ''}`,
      time: 'Recently',
      icon: conv.type === 'channel' ? 'fa-hashtag' : conv.type === 'group' ? 'fa-user-group' : 'fa-user',
      convId: conv.id
    });
    (conv.messages || []).forEach(msg => {
      if (msg) {
        const type = (msg.type || '').toLowerCase();
        const attachment = msg.attachment || (msg.attachments && msg.attachments[0]) || (msg.Attachments && msg.Attachments[0]);
        if (attachment) {
          const fileName = attachment.fileName || attachment.FileName || '';
          const content = msg.content || msg.Content || '';
          const isVoicemail = type === 'attachment' && (
            fileName.startsWith('voicemail-') || content.startsWith('voicemail-')
          );
          if (!isVoicemail) {
            activityFeed.push({
              id: `file-${msg.id}`,
              title: `Shared: ${fileName}`,
              time: 'Shared',
              icon: 'fa-file-arrow-up',
              convId: conv.id
            });
          }
        }
      }
    });
  });

  const getTabTitle = () => {
    switch (activeTab) {
      case 'activity': return 'Activity';
      case 'chat': return 'Chat';
      case 'teams': return 'Teams';
      case 'calls': return 'Calls';
      case 'calendar': return 'Calendar';
      case 'admin': return 'Admin';
      default: return 'SecureComm';
    }
  };

  return (
    <div className={`app-sidebar list-panel-inner ${mobileSidebarActive ? 'active' : ''}`} id="app-sidebar">
      <div className="list-panel-header teams-sidebar-header">
        <h2 className="sidebar-tab-title">{getTabTitle()}</h2>
        
        <div className="user-status-widget">
          <div className={`status-indicator ${(presenceStatus || '').toLowerCase()}`}></div>
          <select 
            id="select-presence" 
            className="presence-select"
            value={presenceStatus}
            onChange={(e) => onPresenceChange(e.target.value)}
          >
            <option value="Online">Online</option>
            <option value="Busy">Busy</option>
            <option value="Away">Away</option>
            <option value="DoNotDisturb">DND</option>
            <option value="Offline">Offline</option>
          </select>
        </div>
      </div>

      {/* Search Filter Box */}
      <div className="search-box teams-search-box">
        <i className="fa-solid fa-magnifying-glass search-icon"></i>
        <input 
          type="text" 
          id="search-input" 
          placeholder="Search..."
          value={filterKeyword}
          onChange={(e) => setFilterKeyword(e.target.value)}
        />
      </div>

      {/* Navigation Sections */}
      <div className="sidebar-navigation">
        
        {/* Pinned Favorites Section */}
        {favorites.length > 0 && activeTab === 'chat' && (
          <div className="nav-section">
            <div className="section-title favorite-title">
              <span>★ FAVORITES</span>
            </div>
            <ul className="nav-list">
              {favorites.map(conv => {
                if (!conv) return null;
                return (
                  <li 
                    key={`fav-${conv.id}`} 
                    className={`nav-item ${conv.id === activeChatId ? 'active' : ''}`}
                    onClick={() => handleConversationClick(conv.id)}
                  >
                    {conv.type === 'dm' ? (
                      <div className="avatar-wrapper">
                        <div className="avatar text-avatar avatar-purple small-avatar">
                          {(conv.name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className={`status-badge ${getOtherUserPresence(conv).toLowerCase()}`}></div>
                      </div>
                    ) : (
                      <i className={conv.type === 'group' ? "fa-solid fa-user-group icon" : "fa-solid fa-hashtag icon"}></i>
                    )}
                    <span className="name">{(conv.name || '')}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Tabbed content mapping */}
        {activeTab === 'activity' && (
          <div className="nav-section">
            <div className="section-title">
              <span>RECENT ACTIVITY</span>
            </div>
            <div className="activity-feed-list">
              {activityFeed.map(item => (
                <div 
                  key={item.id} 
                  className="activity-item"
                  onClick={() => handleConversationClick(item.convId)}
                >
                  <div className="activity-icon">
                    <i className={`fa-solid ${item.icon}`}></i>
                  </div>
                  <div className="activity-details">
                    <span className="activity-title">{item.title}</span>
                    <span className="activity-time">{item.time}</span>
                  </div>
                </div>
              ))}
              {activityFeed.length === 0 && (
                <div className="empty-state">
                  No recent activities
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <>
            {/* DIRECT MESSAGES */}
            <div className="nav-section">
              <div className="section-title">
                <span>RECENT CHATS</span>
                <i className="fa-solid fa-plus add-btn" id="add-dm-btn" onClick={onAddDm} title="Start Direct Message"></i>
              </div>
              <ul className="nav-list" id="dms-list">
                {dms.map(conv => {
                  if (!conv) return null;
                  const otherUserStatus = getOtherUserPresence(conv);
                  return (
                    <li 
                      key={conv.id} 
                      className={`nav-item ${conv.id === activeChatId ? 'active' : ''}`}
                      onClick={() => handleConversationClick(conv.id)}
                    >
                      <div className="avatar-wrapper">
                        <div className="avatar text-avatar avatar-purple small-avatar">
                          {(conv.name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className={`status-badge ${otherUserStatus.toLowerCase()}`}></div>
                      </div>
                      <span className="name">{(conv.name || '')}</span>
                      <span className="favorite-toggle" onClick={(e) => { e.stopPropagation(); onToggleFavorite(conv.id); }}>
                        <i className={`fa-solid fa-star ${favoriteConvIds.includes(conv.id) ? 'active' : ''}`}></i>
                      </span>
                    </li>
                  );
                })}
                {dms.length === 0 && (
                  <div className="empty-state">No recent chats</div>
                )}
              </ul>
            </div>

            {/* GROUP CHATS */}
            <div className="nav-section">
              <div className="section-title">
                <span>GROUP CHATS</span>
                <i className="fa-solid fa-plus add-btn" id="add-group-btn" onClick={onAddGroup} title="Create Group Chat"></i>
              </div>
              <ul className="nav-list" id="groups-list">
                {groups.map(conv => {
                  if (!conv) return null;
                  return (
                    <li 
                      key={conv.id} 
                      className={`nav-item ${conv.id === activeChatId ? 'active' : ''}`}
                      onClick={() => handleConversationClick(conv.id)}
                    >
                      <i className="fa-solid fa-user-group icon"></i>
                      <span className="name">{(conv.name || '')}</span>
                      <span className="favorite-toggle" onClick={(e) => { e.stopPropagation(); onToggleFavorite(conv.id); }}>
                        <i className={`fa-solid fa-star ${favoriteConvIds.includes(conv.id) ? 'active' : ''}`}></i>
                      </span>
                    </li>
                  );
                })}
                {groups.length === 0 && (
                  <div className="empty-state">No group chats</div>
                )}
              </ul>
            </div>

            {/* ALL CONTACTS */}
            <div className="nav-section">
              <div className="section-title">
                <span>ALL CONTACTS</span>
              </div>
              <ul className="nav-list" id="all-contacts-list">
                {allContacts.map(contact => {
                  if (!contact) return null;
                  const activeConv = conversations[activeChatId];
                  const isSelected = activeConv && activeConv.type === 'dm' && activeConv.members?.includes(contact.username);
                  return (
                    <li 
                      key={contact.id} 
                      className={`nav-item ${isSelected ? 'active' : ''}`}
                      onClick={() => onStartDirectMessage(contact.id)}
                    >
                      <div className="avatar-wrapper">
                        <div className={`avatar text-avatar ${contact.avatarClass || 'avatar-purple'} small-avatar`}>
                          {contact.letter || (contact.displayName || contact.username || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className={`status-badge ${(contact.status || 'Offline').toLowerCase()}`}></div>
                      </div>
                      <span className="name">{contact.displayName || contact.username}</span>
                    </li>
                  );
                })}
                {allContacts.length === 0 && (
                  <div className="empty-state">No contacts available</div>
                )}
              </ul>
            </div>
          </>
        )}

        {activeTab === 'teams' && (
          <div className="nav-section teams-accordion-sidebar">
            <div className="section-title">
              <span>YOUR TEAMS</span>
              <i className="fa-solid fa-plus add-btn" id="add-channel-btn" onClick={onAddChannel} title="Create Channel"></i>
            </div>
            
            {Object.keys(teamsMap).map(teamName => {
              const isCollapsed = collapsedTeams[teamName] ?? false;
              const teamChannels = teamsMap[teamName];
              
              let teamIcon = "fa-briefcase";
              const teamLower = teamName.toLowerCase();
              if (teamLower.includes('command') || teamLower.includes('general') || teamLower.includes('admin')) {
                teamIcon = "fa-shield-halved";
              } else if (teamLower.includes('dev') || teamLower.includes('tech') || teamLower.includes('engineering') || teamLower.includes('r&d')) {
                teamIcon = "fa-code";
              } else if (teamLower.includes('marketing') || teamLower.includes('sales')) {
                teamIcon = "fa-chart-line";
              } else if (teamLower.includes('support') || teamLower.includes('help')) {
                teamIcon = "fa-circle-question";
              } else if (teamLower.includes('hr') || teamLower.includes('people')) {
                teamIcon = "fa-user-tie";
              }

              return (
                <div className="team-node" key={teamName}>
                  <div 
                    className={`team-node-header ${isCollapsed ? 'collapsed' : ''}`}
                    onClick={() => toggleTeamCollapse(teamName)}
                  >
                    <i className={`fa-solid ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down'} chevron`}></i>
                    <i className={`fa-solid ${teamIcon} team-icon`}></i>
                    <span className="team-name">{teamName}</span>
                  </div>
                  {!isCollapsed && (
                    <div className="team-channels">
                      <ul className="nav-list">
                        {teamChannels.map(conv => {
                          if (!conv) return null;
                          return (
                            <li 
                              key={conv.id} 
                              className={`nav-item ${conv.id === activeChatId ? 'active' : ''}`}
                              onClick={() => handleConversationClick(conv.id)}
                            >
                              <i className="fa-solid fa-hashtag icon"></i>
                              <span className="name">{conv.displayName}</span>
                              <span className="favorite-toggle" onClick={(e) => { e.stopPropagation(); onToggleFavorite(conv.id); }}>
                                <i className={`fa-solid fa-star ${favoriteConvIds.includes(conv.id) ? 'active' : ''}`}></i>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'calls' && (
          <div className="nav-section calls-nav-section">
            <ul className="nav-list">
              {[
                { id: 'recent', label: 'History', icon: 'fa-clock-rotate-left' },
                { id: 'contacts', label: 'Contacts', icon: 'fa-address-book' },
                { id: 'voicemail', label: 'Voicemail', icon: 'fa-voicemail' },
                { id: 'meeting', label: 'Meeting', icon: 'fa-video' }
              ].map(sub => (
                <li
                  key={sub.id}
                  className={`nav-item ${callSubTab === sub.id ? 'active' : ''}`}
                  onClick={() => setCallSubTab(sub.id)}
                >
                  <i className={`fa-solid ${sub.icon} icon`}></i>
                  <span className="name">{sub.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="nav-section">
            <div className="section-title">
              <span>CALENDAR</span>
            </div>
            <div className="empty-state">
              Manage upcoming scheduled calls and video meetings.
            </div>
          </div>
        )}

        {activeTab === 'admin' && (
          <div className="nav-section">
            <div className="section-title">
              <span>SYSTEM ADMIN</span>
            </div>
            <div className="empty-state">
              Auditing communications, logs, and storage security records.
            </div>
          </div>
        )}

      </div>

      {/* Current User Card at bottom */}
      <div className="sidebar-user-card" onClick={onOpenProfileDrawer}>
        <div className="avatar text-avatar avatar-gold">
          {currentUser ? ((currentUser.username || currentUser.displayName || 'U').charAt(0).toUpperCase()) : 'U'}
        </div>
        <div className="user-details">
          <span className="user-display-name">
            {currentUser ? (currentUser.username || currentUser.displayName || 'User') : 'User'}
          </span>
          <span className="user-role-badge">
            {currentUser ? (currentUser.role || 'Guest') : 'Guest'}
          </span>
        </div>
        <button 
          className="icon-btn settings-btn"
          id="settings-trigger"
          title="Profile Settings"
          onClick={(e) => { e.stopPropagation(); onOpenProfileDrawer(); }}
        >
          <i className="fa-solid fa-gear"></i>
        </button>
      </div>
    </div>
  );
}

export default Sidebar;
