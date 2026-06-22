import React, { useState, useEffect } from 'react';
import { BASE_URL } from '../config';
import ContactsSection from './ContactsSection';

function VoicePlayer({ attachmentId, token }) {
  const [audioUrl, setAudioUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
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

export default function CallsSection({
  usersCache,
  currentUser,
  onStartCall,
  token,
  callHubConnection,
  onStartConference,
  activeSubTab = 'recent',
  onJoinMeeting,
  conversations
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(null);
  
  // T9 / Dial pad simulation states
  const [dialedInput, setDialedInput] = useState('');
  const [favorites, setFavorites] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [callHistory, setCallHistory] = useState([]);
  const [meetingId, setMeetingId] = useState('');

  useEffect(() => {
    // Load favorites, blocks, and call history
    const savedFavs = JSON.parse(localStorage.getItem(`favs_${currentUser?.id || ''}`) || "[]");
    const savedBlocks = JSON.parse(localStorage.getItem(`blocks_${currentUser?.id || ''}`) || "[]");
    const savedHistory = JSON.parse(localStorage.getItem(`callHistory_${currentUser?.id || ''}`) || "[]");
    
    setFavorites(savedFavs);
    setBlocks(savedBlocks);
    setCallHistory(savedHistory);
  }, [currentUser]);

  const saveCallHistory = (history) => {
    setCallHistory(history);
    localStorage.setItem(`callHistory_${currentUser?.id || ''}`, JSON.stringify(history));
  };

  // Compile real voicemails received by this user
  const voicemails = [];
  if (conversations) {
    Object.values(conversations).forEach(conv => {
      if (!conv || !conv.messages) return;
      conv.messages.forEach(msg => {
        if (msg) {
          const type = (msg.type || '').toLowerCase();
          const attachment = msg.attachment || (msg.attachments && msg.attachments[0]) || (msg.Attachments && msg.Attachments[0]);
          if (type === 'attachment' && attachment) {
            const fileName = attachment.fileName || attachment.FileName || '';
            const content = msg.content || msg.Content || '';
            const fileType = attachment.fileType || attachment.FileType || '';
            
            const isAudio = fileType.toLowerCase().includes('audio') ||
                            /\.(webm|wav|mp3|mp4|m4a)$/i.test(fileName) ||
                            fileName.endsWith('.webm') ||
                            fileName.endsWith('.wav') ||
                            fileName.endsWith('.mp3') ||
                            fileName.endsWith('.mp4') ||
                            fileName.endsWith('.m4a');
                            
            const msgSenderId = (msg.senderId || msg.SenderId || '').toString().toLowerCase();
            const currentUserId = (currentUser?.id || currentUser?.Id || '').toString().toLowerCase();
            
            const isVoicemail = fileName.startsWith('voicemail-') || content.startsWith('voicemail-');
            
            if (isAudio && isVoicemail && msgSenderId !== currentUserId) {
              voicemails.push({
                id: msg.id || msg.Id,
                attachmentId: attachment.id || attachment.Id,
                senderId: msgSenderId,
                fileName: fileName,
                timestamp: msg.timestamp || msg.Timestamp || msg.createdDate || msg.CreatedDate,
                fileSize: attachment.fileSize || attachment.FileSize
              });
            }
          }
        }
      });
    });
  }
  voicemails.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const toggleFavorite = (targetUserId) => {
    let updated;
    if (favorites.includes(targetUserId)) {
      updated = favorites.filter(id => id !== targetUserId);
    } else {
      updated = [...favorites, targetUserId];
    }
    setFavorites(updated);
    localStorage.setItem(`favs_${currentUser?.id || ''}`, JSON.stringify(updated));
  };

  // T9 mappings
  const t9Map = {
    '2': 'abc', '3': 'def', '4': 'ghi', '5': 'jkl',
    '6': 'mno', '7': 'pqrs', '8': 'tuv', '9': 'wxyz'
  };

  const matchT9 = (name, number) => {
    if (!number) return true;
    let numIdx = 0;
    const nameLower = (name || '').toLowerCase();
    
    for (let i = 0; i < nameLower.length && numIdx < number.length; i++) {
      const char = nameLower[i];
      const digit = number[numIdx];
      const allowedChars = t9Map[digit] || '';
      if (allowedChars.includes(char) || char === digit) {
        numIdx++;
      }
    }
    return numIdx === number.length;
  };

  // Contacts filtering: include only the actual user records mapped by GUID keys to avoid duplication
  const eligibleUsers = Object.values(usersCache || {}).filter(
    (u, index, self) => u && u.id && self.findIndex(t => t.id === u.id) === index && u.id !== currentUser?.id
  );

  // Filter contacts by name/username search query OR dialed input (T9)
  const filteredUsers = eligibleUsers.filter(u => {
    const matchesSearch = searchQuery 
      ? ((u.displayName || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
         (u.username || '').toLowerCase().includes(searchQuery.toLowerCase()))
      : true;
      
    const matchesDialed = dialedInput 
      ? (matchT9(u.displayName, dialedInput) || matchT9(u.username, dialedInput) || (u.username || '').includes(dialedInput))
      : true;
      
    return matchesSearch && matchesDialed;
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const aFav = favorites.includes(a.id) ? 1 : 0;
    const bFav = favorites.includes(b.id) ? 1 : 0;
    return bFav - aFav;
  });

  const handleStartCallClick = (targetUser, isVideo) => {
    if (blocks.includes(targetUser.id)) {
      alert("You have blocked this contact. Unblock them first to call.");
      return;
    }

    // Add to call history
    const newRecord = {
      id: `call-rec-${Date.now()}`,
      userId: targetUser.id,
      displayName: targetUser.displayName || '',
      avatarClass: targetUser.avatarClass || '',
      letter: targetUser.letter || '',
      timestamp: new Date().toISOString(),
      type: isVideo ? 'Video' : 'Audio',
      direction: 'Outgoing', // 'Incoming' | 'Outgoing' | 'Missed'
      duration: '00:00' // updated when completed or simulated
    };
    
    const updatedHistory = [newRecord, ...callHistory];
    saveCallHistory(updatedHistory);

    onStartCall(targetUser, isVideo);
  };

  const handleDialKey = (key) => setDialedInput(prev => prev + key);
  const handleDialBackspace = () => setDialedInput(prev => prev.slice(0, -1));
  const handleClearDial = () => setDialedInput('');

  const handleStartConferenceClick = () => {
    onStartConference({
      id: `conf-${Date.now()}`,
      displayName: 'Ad-hoc Conference Call',
      isVideo: true,
      isGroup: true
    });
  };

  const handleJoinMeeting = (e) => {
    e.preventDefault();
    if (meetingId.trim() && onJoinMeeting) {
      onJoinMeeting(meetingId.trim());
      setMeetingId('');
    }
  };

  return (
    <div className="calls-section" style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
      <div className="calls-center-content" style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
        
        {/* Sub-tab 1: HISTORY */}
        {activeSubTab === 'recent' && (
          <div className="calls-history-container" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div className="calls-history-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontWeight: 600, fontSize: '1.5rem' }}>Call History</h2>
              <button 
                onClick={() => saveCallHistory([])}
                className="btn btn-secondary clear-history-btn"
                disabled={callHistory.length === 0}
                style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '8px', cursor: callHistory.length === 0 ? 'not-allowed' : 'pointer' }}
              >
                Clear All Logs
              </button>
            </div>

            <div className="calls-history-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {callHistory.map(record => {
                const isMissed = record.direction === 'Missed';
                const isOutgoing = record.direction === 'Outgoing';

                return (
                  <div key={record.id} className="call-record-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-color)', transition: 'background 0.2s' }}>
                    <div className="call-record-info" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div className={`avatar text-avatar ${record.avatarClass || 'avatar-purple'}`} style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>
                        {record.letter}
                      </div>

                      <div className="call-record-details">
                        <div className={`call-record-name ${isMissed ? 'missed' : ''}`} style={{ fontWeight: 600, color: isMissed ? '#ef4444' : 'var(--text-primary)', fontSize: '1.1rem' }}>
                          {record.displayName}
                        </div>
                        <div className="call-record-meta" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {isOutgoing ? (
                            <i className="fa-solid fa-arrow-up-right outgoing-icon" style={{ color: 'var(--text-muted)' }}></i>
                          ) : isMissed ? (
                            <i className="fa-solid fa-arrow-down-left missed-icon" style={{ color: '#ef4444' }}></i>
                          ) : (
                            <i className="fa-solid fa-arrow-down-left incoming-icon" style={{ color: 'var(--online)' }}></i>
                          )}
                          <span>{record.direction} • {new Date(record.timestamp).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="call-record-actions" style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => {
                          const targetUser = usersCache ? (usersCache[record.userId] || Object.values(usersCache).find(user => user && user.id && user.id.toLowerCase() === record.userId.toString().toLowerCase())) : null;
                          if (targetUser) handleStartCallClick(targetUser, false);
                        }}
                        style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Voice Call"
                      >
                        <i className="fa-solid fa-phone call-icon-audio"></i>
                      </button>
                      <button
                        onClick={() => {
                          const targetUser = usersCache ? (usersCache[record.userId] || Object.values(usersCache).find(user => user && user.id && user.id.toLowerCase() === record.userId.toString().toLowerCase())) : null;
                          if (targetUser) handleStartCallClick(targetUser, true);
                        }}
                        style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Video Call"
                      >
                        <i className="fa-solid fa-video call-icon-video"></i>
                      </button>
                    </div>
                  </div>
                );
              })}

              {callHistory.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-color)', marginTop: '1rem' }}>
                  <div style={{ marginBottom: '1.5rem', color: 'var(--primary)', opacity: 0.8 }}>
                    <i className="fa-solid fa-phone-slash" style={{ fontSize: '4.5rem' }}></i>
                  </div>
                  <h3 style={{ fontSize: '1.5rem', marginBottom: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Call History</h3>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', maxWidth: '400px', fontSize: '1rem', lineHeight: '1.5' }}>
                    When you make or receive voice and video calls, your history will appear here.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sub-tab 2: CONTACTS */}
        {activeSubTab === 'contacts' && (
          <ContactsSection 
            usersCache={usersCache}
            currentUser={currentUser}
            onStartCall={onStartCall}
            token={token}
          />
        )}

        {/* Sub-tab 3: VOICEMAIL */}
        {activeSubTab === 'voicemail' && (
          <div className="calls-voicemail-container" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div className="calls-voicemail-header" style={{ marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontWeight: 600, fontSize: '1.5rem' }}>Received Voicemails</h2>
            </div>

            <div className="calls-voicemail-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {voicemails.map(vm => {
                const sender = (usersCache && usersCache[vm.senderId]) || { displayName: "Unknown User", avatarClass: "avatar-purple", letter: "U" };
                return (
                  <div key={vm.id} className="voicemail-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    <div className="voicemail-info" style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1, marginRight: '24px' }}>
                      <div className={`avatar text-avatar ${sender.avatarClass || 'avatar-purple'} small-avatar`} style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>
                        {sender.letter || (sender.displayName || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="voicemail-details" style={{ flex: 1 }}>
                        <div className="voicemail-title" style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                          Voicemail from {sender.displayName || sender.username}
                        </div>
                        <div className="voicemail-meta" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px', marginBottom: '8px' }}>
                          {new Date(vm.timestamp).toLocaleString()} • {((vm.fileSize || 0) / 1024).toFixed(1)} KB
                        </div>
                        <VoicePlayer attachmentId={vm.attachmentId} token={token} />
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        handleStartCallClick(sender, false);
                      }}
                      className="btn btn-secondary callback-btn" 
                      style={{ padding: '10px 20px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Callback
                    </button>
                  </div>
                );
              })}

              {voicemails.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                  <div style={{ marginBottom: '1.5rem', color: 'var(--primary)', opacity: 0.8 }}>
                    <i className="fa-solid fa-microphone-slash" style={{ fontSize: '4.5rem' }}></i>
                  </div>
                  <h3 style={{ fontSize: '1.5rem', marginBottom: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Voicemails</h3>
                  <p style={{ color: 'var(--text-muted)', maxWidth: '400px', fontSize: '1rem', lineHeight: '1.5' }}>
                    You have not received any voice message recordings. Any voicemails left when you are busy or offline will appear here.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sub-tab 4: MEETING */}
        {activeSubTab === 'meeting' && (
          <div className="calls-meeting-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100%', padding: '24px' }}>
            
            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: '900px' }}>
              
              {/* Join/Start Card */}
              <div className="meeting-card" style={{ flex: '1 1 350px', background: 'var(--bg-app)', padding: '40px 32px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'rgba(91, 95, 199, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}>
                    <i className="fa-solid fa-video" style={{ fontSize: '2rem', color: 'var(--primary)' }}></i>
                  </div>
                  <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700, color: '#fff' }}>Secure Meetings</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginTop: '12px', lineHeight: 1.5 }}>Host high-quality, end-to-end encrypted video conferences instantly.</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, justifyContent: 'center' }}>
                  <button 
                    className="btn btn-primary" 
                    onClick={handleStartConferenceClick}
                    style={{ width: '100%', padding: '16px', fontSize: '1.1rem', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', borderRadius: '10px', boxShadow: '0 4px 12px rgba(91, 95, 199, 0.3)' }}
                  >
                    <i className="fa-solid fa-video"></i> Start a Meeting
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '8px 0' }}>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '1px' }}>OR JOIN</span>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                  </div>

                  <form onSubmit={handleJoinMeeting} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ position: 'relative' }}>
                      <i className="fa-solid fa-link" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}></i>
                      <input 
                        type="text"
                        value={meetingId}
                        onChange={(e) => setMeetingId(e.target.value)}
                        placeholder="Enter meeting ID..."
                        style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', padding: '16px 16px 16px 48px', borderRadius: '10px', color: '#fff', outline: 'none', fontSize: '1.05rem', transition: 'border-color 0.2s' }}
                      />
                    </div>
                    <button 
                      type="submit" 
                      disabled={!meetingId.trim()}
                      style={{ width: '100%', padding: '16px', fontSize: '1.1rem', fontWeight: 'bold', background: meetingId.trim() ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)', color: meetingId.trim() ? '#fff' : 'rgba(255,255,255,0.3)', border: 'none', borderRadius: '10px', cursor: meetingId.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}
                    >
                      Join Meeting
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
