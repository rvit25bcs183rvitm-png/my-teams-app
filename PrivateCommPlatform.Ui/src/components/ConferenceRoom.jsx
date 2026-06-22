import { useState, useEffect, useRef } from 'react';
import CallManager from '../services/CallManager';
import AddParticipantModal from './AddParticipantModal';

function RemoteVideoTile({ stream, participant }) {
  const videoRef = useRef(null);
  
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideo = stream && stream.getVideoTracks().some(t => t.enabled && t.readyState === 'live');

  if (hasVideo) {
    return (
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="conf-tile-video"
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }}
      />
    );
  }

  return (
    <div className="conf-tile-avatar-container">
      <div className={`avatar text-avatar ${participant.avatarClass} conf-tile-avatar`}>
        {participant.letter}
      </div>
      <span className="conf-tile-cam-off-text">Camera Off</span>
    </div>
  );
}

function RemoteScreenShare({ stream }) {
  const videoRef = useRef(null);
  
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="conf-presentation-video"
      style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#0a0b10', borderRadius: '12px' }}
    />
  );
}

export default function ConferenceRoom({
  activeCall,
  currentUser,
  token,
  callHubConnection,
  onMinimize,
  onHangUp,
  conversations,
  usersCache,
  onSendMessage
}) {
  const [callState, setCallState] = useState('connecting'); // 'connecting' | 'connected' | 'ended'
  const [seconds, setSeconds] = useState(0);
  
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(activeCall?.isVideo || false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isVirtualBackground, setIsVirtualBackground] = useState(false);
  const [raisedHand, setRaisedHand] = useState(false);
  const [activeJoinCode, setActiveJoinCode] = useState(activeCall?.joinCode || '');

  // Floating Reactions list for anim
  const [activeReactions, setActiveReactions] = useState([]); // { id, emoji, x }

  // Drawers
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [chatText, setChatText] = useState('');

  // Host properties
  const [isLocked, setIsLocked] = useState(false);
  const [hostUserId, setHostUserId] = useState(activeCall?.organizerId || currentUser?.id);

  const handleAddMember = async (userId) => {
    if (callHubConnection && activeCall?.id) {
      try {
        await callHubConnection.invoke("AddMemberToCall", activeCall.id, userId);
        
        // Dynamically add to invitedParticipants list if not already there
        setInvitedParticipants(prev => {
          if (prev.some(p => p.id === userId)) return prev;
          const userMeta = usersCache[userId.toLowerCase()] || {};
          return [
            ...prev,
            {
              id: userId,
              displayName: userMeta.displayName || userMeta.username || 'Invited User',
              avatarClass: userMeta.avatarClass || 'avatar-purple',
              letter: userMeta.letter || (userMeta.displayName || userMeta.username || 'I').charAt(0).toUpperCase()
            }
          ];
        });

        alert("Invitation sent to participant.");
      } catch (err) {
        console.error("Failed to add member to call:", err);
        alert("Failed to add member: " + (err.message || err));
      }
    } else {
      alert("Unable to add participant before meeting connection is established.");
    }
  };

  // WebRTC streams states
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [remoteScreenStream, setRemoteScreenStream] = useState(null);
  const [localScreenStream, setLocalScreenStream] = useState(null);

  const localVideoRef = useRef(null);
  const timerRef = useRef(null);
  const callInitiatedRef = useRef(false);

  const conversationId = activeCall?.conversationId || activeCall?.user?.id;
  const activeConversation = conversations[conversationId];

  // Compile full list of conversation members for the Participants drawer
  const [invitedParticipants, setInvitedParticipants] = useState([]);

  useEffect(() => {
    if (activeConversation) {
      const list = (activeConversation.memberDetails || [])
        .filter(m => m.userId !== currentUser?.id)
        .map(m => {
          const userMeta = usersCache[m.userId.toLowerCase()] || {};
          return {
            id: m.userId,
            displayName: m.displayName || m.username || m.name || '',
            avatarClass: userMeta.avatarClass || 'avatar-purple',
            letter: userMeta.letter || (m.displayName || m.username || m.name || 'U').charAt(0).toUpperCase()
          };
        });
      setInvitedParticipants(list);
    } else if (activeCall?.user && activeCall.user.id !== currentUser?.id) {
      // Fallback single participant
      setInvitedParticipants([
        {
          id: activeCall.user.id,
          displayName: activeCall.user.displayName || 'Team Partner',
          avatarClass: activeCall.user.avatarClass || 'avatar-gold',
          letter: activeCall.user.letter || 'P'
        }
      ]);
    }
  }, [activeConversation, activeCall, usersCache, currentUser]);

  // Bind localStream to local video element
  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Initialize CallManager and Listeners on mount
  useEffect(() => {
    if (!callHubConnection) return;

    // Initialize CallManager singleton
    CallManager.init(callHubConnection, currentUser, token);

    // Sync initial states
    setIsCameraOn(CallManager.isVideoEnabled);
    setIsMuted(CallManager.isMuted);
    setIsScreenSharing(CallManager.isScreenSharing);
    setLocalScreenStream(CallManager.screenStream);
    setIsVirtualBackground(CallManager.isVirtualBackground);

    // Helper functions for event handling
    const handleLocalStreamChanged = (stream) => {
      setLocalStream(stream);
    };

    const handleRemoteTrackAdded = (targetUserId, stream) => {
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.set(targetUserId, stream);
        return next;
      });
    };

    const handleRemoteScreenAdded = (targetUserId, stream) => {
      setRemoteScreenStream(stream);
    };

    const handleRemoteScreenRemoved = () => {
      setRemoteScreenStream(null);
    };

    const handlePeerDisconnected = (targetUserId) => {
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.delete(targetUserId);
        return next;
      });
    };

    const handleVideoChanged = (enabled) => setIsCameraOn(enabled);
    const handleMutedChanged = (muted) => setIsMuted(muted);
    const handleScreenShareChanged = (sharing) => {
      setIsScreenSharing(sharing);
      setLocalScreenStream(CallManager.screenStream);
    };
    const handleVirtualBgChanged = (vb) => setIsVirtualBackground(vb);

    const handleCallEnded = () => {
      onHangUp();
    };

    const handleForcedDisconnect = () => {
      alert("You have been removed from the meeting.");
      onHangUp();
    };

    const handleMuteMic = () => {
      CallManager.toggleMute();
      alert("You have been muted by the host.");
    };

    const handleReactionReceived = (senderId, emoji) => {
      triggerFloatingReaction(emoji);
    };

    // Bind CallManager events
    CallManager.on('local_stream_changed', handleLocalStreamChanged);
    CallManager.on('remote_track_added', handleRemoteTrackAdded);
    CallManager.on('remote_screen_added', handleRemoteScreenAdded);
    CallManager.on('remote_screen_removed', handleRemoteScreenRemoved);
    CallManager.on('peer_disconnected', handlePeerDisconnected);
    CallManager.on('video_changed', handleVideoChanged);
    CallManager.on('muted_changed', handleMutedChanged);
    CallManager.on('screen_share_changed', handleScreenShareChanged);
    CallManager.on('virtual_bg_changed', handleVirtualBgChanged);
    CallManager.on('call_ended', handleCallEnded);
    CallManager.on('forced_disconnect', handleForcedDisconnect);

    // Bind SignalR hub direct notifications for group meetings
    callHubConnection.on("MuteMicrophone", handleMuteMic);
    callHubConnection.on("ReceiveConferenceReaction", handleReactionReceived);

    // Start timer
    timerRef.current = setInterval(() => {
      setSeconds(prev => prev + 1);
    }, 1000);

    return () => {
      CallManager.off('local_stream_changed', handleLocalStreamChanged);
      CallManager.off('remote_track_added', handleRemoteTrackAdded);
      CallManager.off('remote_screen_added', handleRemoteScreenAdded);
      CallManager.off('remote_screen_removed', handleRemoteScreenRemoved);
      CallManager.off('peer_disconnected', handlePeerDisconnected);
      CallManager.off('video_changed', handleVideoChanged);
      CallManager.off('muted_changed', handleMutedChanged);
      CallManager.off('screen_share_changed', handleScreenShareChanged);
      CallManager.off('virtual_bg_changed', handleVirtualBgChanged);
      CallManager.off('call_ended', handleCallEnded);
      CallManager.off('forced_disconnect', handleForcedDisconnect);

      callHubConnection.off("MuteMicrophone", handleMuteMic);
      callHubConnection.off("ReceiveConferenceReaction", handleReactionReceived);

      if (timerRef.current) clearInterval(timerRef.current);
      CallManager.leaveCall();
      CallManager.cleanup();
    };
  }, [callHubConnection]);

  // Hook to start/join calling session on mount
  useEffect(() => {
    if (!callHubConnection || callInitiatedRef.current) return;

    const initiateCallSession = async () => {
      callInitiatedRef.current = true;

      // Ensure local media is ready
      CallManager.isVideoEnabled = activeCall.isVideo || false;
      await CallManager.initializeLocalStream().catch(e => console.error(e));

      try {
        if (!activeCall.id) {
          // Trigger start or join via Hub
          if (activeCall.isInstantStart) {
            await callHubConnection.invoke("StartInstantMeeting");
          } else if (activeCall.joinCode) {
            await callHubConnection.invoke("JoinMeetingById", activeCall.joinCode);
          } else if (activeCall.conversationId) {
            const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (guidRegex.test(activeCall.conversationId)) {
              await callHubConnection.invoke("StartGroupCall", activeCall.conversationId);
            } else {
              await callHubConnection.invoke("StartInstantMeeting");
            }
          }
        } else {
          // Call ID is already resolved, join directly
          await joinActiveSession();
        }
      } catch (err) {
        console.error("Failed to start group call session:", err);
        alert(`Failed to start meeting: ${err.message || err}`);
        onHangUp();
      }
    };

    const joinActiveSession = async () => {
      setCallState('connected');
      // Resolve target user IDs to send/receive offers
      let targetUserIds = [];
      if (activeConversation) {
        targetUserIds = activeConversation.memberDetails?.map(m => m.userId) || [];
      }
      
      const sendOffers = !activeCall.isReceiver;
      await CallManager.joinCall(activeCall.id, targetUserIds, activeCall.isVideo, sendOffers);
    };

    initiateCallSession();
  }, [activeCall, callHubConnection]);

  // Watch for Call ID and JoinCode resolution from parent (App.jsx)
  useEffect(() => {
    if (activeCall?.id && callState === 'connecting') {
      setCallState('connected');
      if (activeCall.joinCode) {
        setActiveJoinCode(activeCall.joinCode);
      }
      
      let targetUserIds = [];
      if (activeConversation) {
        targetUserIds = activeConversation.memberDetails?.map(m => m.userId) || [];
      }
      const sendOffers = !activeCall.isReceiver;
      CallManager.joinCall(activeCall.id, targetUserIds, activeCall.isVideo, sendOffers)
        .catch(e => console.error("CallManager.joinCall failed:", e));
    }
  }, [activeCall?.id, callState, activeCall?.joinCode]);

  const toggleMute = () => {
    CallManager.toggleMute();
  };

  const toggleCamera = () => {
    CallManager.toggleVideo();
  };

  const toggleScreenShare = () => {
    CallManager.toggleScreenShare();
  };

  const triggerFloatingReaction = (emoji) => {
    const id = `react-${Date.now()}-${Math.random()}`;
    const x = 20 + Math.random() * 60;
    setActiveReactions(prev => [...prev, { id, emoji, x }]);

    setTimeout(() => {
      setActiveReactions(prev => prev.filter(r => r.id !== id));
    }, 2000);

    if (callHubConnection && activeCall?.id) {
      callHubConnection.invoke("SendConferenceReaction", activeCall.id, emoji).catch(() => {});
    }
  };

  const handleSendChatText = (e) => {
    e.preventDefault();
    if (!chatText.trim() || !conversationId) return;

    onSendMessage(chatText);
    setChatText('');
  };

  const handleLeaveConference = async () => {
    if (callHubConnection && activeCall?.id) {
      await callHubConnection.invoke("EndCall", activeCall.id).catch(() => {});
    }
    CallManager.leaveCall();
    CallManager.cleanup();
    setCallState('ended');
    onHangUp();
  };

  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Compile active participants list (connected via WebRTC)
  const activeParticipants = Array.from(remoteStreams.entries()).map(([userId, stream]) => {
    const userMeta = usersCache[userId.toLowerCase()] || {};
    return {
      id: userId,
      displayName: userMeta.displayName || userMeta.username || 'Participant',
      avatarClass: userMeta.avatarClass || 'avatar-purple',
      letter: userMeta.letter || (userMeta.displayName || userMeta.username || 'P').charAt(0).toUpperCase(),
      stream: stream,
      isMuted: false, // We can read track settings if needed
      isCameraOn: stream.getVideoTracks().some(t => t.enabled && t.readyState === 'live')
    };
  });

  return (
    <div className="conference-room">
      
      {/* Top bar info */}
      <div className="conf-top-bar">
        <div className="conf-top-bar-left">
          <div className="conf-recording-indicator"></div>
          <span className="conf-title">
            {(activeCall.user?.displayName || activeCall.user?.username || activeCall.user?.name || '') || 'Group Conference'}
          </span>
          <span className="conf-timer">• {formatTime(seconds)}</span>
          {activeJoinCode && (
            <span className="conf-join-badge" style={{ marginLeft: '16px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold', letterSpacing: '0.5px' }}>
              Meeting Code: {activeJoinCode}
            </span>
          )}
        </div>

        <div className="conf-top-bar-right">
          <button 
            onClick={onMinimize}
            className="conf-minimize-btn" 
            title="Minimize to Dock"
          >
            <i className="fa-solid fa-window-minimize"></i>
          </button>
        </div>
      </div>

      {/* Main conference workspace */}
      <div className="conf-main-workspace">
        
        {/* Floating emoji reactions layer */}
        <div className="conf-floating-reactions-layer">
          {activeReactions.map(r => (
            <div
              key={r.id}
              className="floating-reaction"
              style={{ left: `${r.x}%` }}
            >
              {r.emoji}
            </div>
          ))}
        </div>

        {/* Video feed viewport grid */}
        <div className="conf-video-viewport">
          
          {callState === 'connecting' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
              <div style={{ width: '48px', height: '48px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>Connecting to meeting...</p>
            </div>
          ) : remoteScreenStream ? (
            // Remote screen presentation mode
            <div className="conf-presentation-mode">
              <div className="conf-presentation-screen">
                <RemoteScreenShare stream={remoteScreenStream} />
              </div>
              
              {/* Bottom strip of participants */}
              <div className="conf-bottom-strip">
                {/* Me */}
                <div className="conf-strip-item">
                  {isCameraOn ? (
                    <video ref={localVideoRef} autoPlay playsInline muted className="conf-strip-video" />
                  ) : (
                    <div className="avatar text-avatar avatar-purple conf-strip-avatar">
                      {(currentUser?.displayName || currentUser?.username || 'Y').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="conf-strip-label">You</div>
                </div>

                {/* Others */}
                {activeParticipants.map(p => (
                  <div key={p.id} className="conf-strip-item">
                    <div className={`avatar text-avatar ${p.avatarClass} conf-strip-avatar`}>
                      {p.letter}
                    </div>
                    <div className="conf-strip-label">
                      {p.displayName}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : isScreenSharing ? (
            // Local screen presentation mode
            <div className="conf-presentation-mode">
              <div className="conf-presentation-screen">
                <div className="conf-presentation-placeholder" style={{ background: '#0a0b10', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '12px' }}>
                  <i className="fa-solid fa-desktop conf-presentation-icon" style={{ fontSize: '3rem', color: 'var(--primary)', marginBottom: '16px' }}></i>
                  <h4 style={{ margin: 0, fontSize: '1.25rem' }}>You are presenting your screen</h4>
                  <p className="conf-presentation-text" style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '6px' }}>Sharing content with all participants in the conference.</p>
                </div>
              </div>
              
              {/* Bottom strip of participants */}
              <div className="conf-bottom-strip">
                {/* Me */}
                <div className="conf-strip-item">
                  {isCameraOn ? (
                    <video ref={localVideoRef} autoPlay playsInline muted className="conf-strip-video" />
                  ) : (
                    <div className="avatar text-avatar avatar-purple conf-strip-avatar">
                      {(currentUser?.displayName || currentUser?.username || 'Y').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="conf-strip-label">You</div>
                </div>

                {/* Others */}
                {activeParticipants.map(p => (
                  <div key={p.id} className="conf-strip-item">
                    <div className={`avatar text-avatar ${p.avatarClass} conf-strip-avatar`}>
                      {p.letter}
                    </div>
                    <div className="conf-strip-label">
                      {p.displayName}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Full Grid mode (You + Active participants)
            <div className={`conf-video-grid ${activeParticipants.length === 0 ? 'conf-video-grid-single' : 'conf-video-grid-multiple'}`}>
              
              {/* Tile 1: You */}
              <div className={`conf-video-tile ${raisedHand ? 'raised-hand' : ''}`}>
                {isCameraOn ? (
                  <video ref={localVideoRef} autoPlay playsInline muted className="conf-tile-video" />
                ) : (
                  <div className="conf-tile-avatar-container">
                    <div className="avatar text-avatar avatar-purple conf-tile-avatar">
                      {(currentUser?.username || currentUser?.displayName || 'U').charAt(0).toUpperCase()}
                    </div>
                    <span className="conf-tile-cam-off-text">Camera Off</span>
                  </div>
                )}

                <div className="conf-tile-label">
                  <span>{(currentUser?.username || currentUser?.displayName || '')} (You)</span>
                  {isMuted && <i className="fa-solid fa-microphone-slash conf-tile-mic-off"></i>}
                </div>

                {raisedHand && (
                  <div className="conf-tile-raised-hand-badge">
                    <i className="fa-solid fa-hand"></i> Raised Hand
                  </div>
                )}
              </div>

              {/* Other Participants tiles */}
              {activeParticipants.map(p => (
                <div key={p.id} className="conf-video-tile">
                  <RemoteVideoTile stream={p.stream} participant={p} />

                  <div className="conf-tile-label">
                    <span>{p.displayName}</span>
                    {p.isMuted && <i className="fa-solid fa-microphone-slash conf-tile-mic-off"></i>}
                  </div>
                </div>
              ))}

            </div>
          )}

        </div>

        {/* SIDEBAR DRAWER 1: MEETING CHAT */}
        {showChat && (
          <div className="conf-sidebar">
            <div className="conf-sidebar-header">
              <h4 className="conf-sidebar-title">Meeting Chat</h4>
              <button onClick={() => setShowChat(false)} className="conf-sidebar-close"><i className="fa-solid fa-xmark"></i></button>
            </div>

            <div className="conf-chat-list">
              {activeConversation?.messages?.map(msg => {
                const sender = usersCache[msg.senderId] || { displayName: 'User', letter: 'U', avatarClass: 'avatar-purple' };
                return (
                  <div key={msg.id} className="conf-chat-msg">
                    <div className={`avatar text-avatar ${sender.avatarClass} conf-chat-avatar`}>{sender.letter}</div>
                    <div className="conf-chat-bubble">
                      <div className="conf-chat-msg-header">
                        <span className="conf-chat-sender">{sender.displayName || sender.username || sender.name || ''}</span>
                      </div>
                      <div>{msg.content}</div>
                    </div>
                  </div>
                );
              })}
              {(!activeConversation?.messages || activeConversation.messages.length === 0) && (
                <div className="conf-chat-empty">No messages sent yet in this room.</div>
              )}
            </div>

            <form onSubmit={handleSendChatText} className="conf-chat-form">
              <input
                type="text"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="Type a message..."
                className="conf-chat-input"
              />
              <button type="submit" className="btn btn-primary conf-chat-submit"><i className="fa-solid fa-paper-plane"></i></button>
            </form>
          </div>
        )}

        {/* SIDEBAR DRAWER 2: PARTICIPANTS */}
        {showParticipants && (
          <div className="conf-sidebar">
            <div className="conf-sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 className="conf-sidebar-title">Participants</h4>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button 
                  onClick={() => setShowAddMember(true)} 
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--primary)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', border: 'none', background: 'none', cursor: 'pointer' }}
                  title="Add Participant"
                >
                  <i className="fa-solid fa-user-plus"></i> Add
                </button>
                <button onClick={() => setShowParticipants(false)} className="conf-sidebar-close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><i className="fa-solid fa-xmark"></i></button>
              </div>
            </div>

            <div className="conf-participant-list">
              {/* You */}
              <div className="conf-participant-item host">
                <div className="conf-participant-info">
                  <div className="avatar text-avatar avatar-purple conf-participant-avatar">{(currentUser?.username || currentUser?.displayName || 'Y').charAt(0).toUpperCase()}</div>
                  <span className="conf-participant-name bold">{(currentUser?.username || currentUser?.displayName || '')} (You)</span>
                </div>
                <div className="conf-participant-status">
                  <span>Host</span>
                </div>
              </div>

              {/* Others */}
              {invitedParticipants.map(p => {
                const isConnected = remoteStreams.has(p.id);
                return (
                  <div key={p.id} className="conf-participant-item">
                    <div className="conf-participant-info">
                      <div className={`avatar text-avatar ${p.avatarClass} conf-participant-avatar`}>{p.letter}</div>
                      <span className="conf-participant-name">{p.displayName}</span>
                    </div>

                    <div className="conf-participant-status">
                      <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', background: isConnected ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)', color: isConnected ? '#22c55e' : 'var(--text-muted)' }}>
                        {isConnected ? 'Active' : 'Invited'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Host action triggers */}
            {hostUserId === currentUser?.id && (
              <div className="conf-host-actions">
                <button
                  onClick={() => {
                    if (callHubConnection && activeCall?.id) {
                      callHubConnection.invoke("MuteAllParticipants", activeCall.id);
                      alert("Muted all participants.");
                    }
                  }}
                  className="btn btn-secondary conf-mute-all-btn"
                  style={{ width: '100%' }}
                >
                  Mute All Participants
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Floating Teams-style Action Controls Bar at bottom */}
      <div className="conf-control-bar">
        
        {/* Mute Mic toggle */}
        <button 
          onClick={toggleMute}
          className={`conf-control-btn ${isMuted ? 'danger' : ''}`}
          title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
        >
          <i className={`fa-solid ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
        </button>

        {/* Camera toggle */}
        <button 
          onClick={toggleCamera}
          className={`conf-control-btn ${isCameraOn ? 'active' : ''}`}
          title={isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
        >
          <i className={`fa-solid ${isCameraOn ? 'fa-video' : 'fa-video-slash'}`}></i>
        </button>

        {/* Share Screen toggle */}
        <button 
          onClick={toggleScreenShare}
          className={`conf-control-btn ${isScreenSharing ? 'active' : ''}`}
          title={isScreenSharing ? 'Stop Presenting' : 'Share Screen'}
        >
          <i className="fa-solid fa-desktop"></i>
        </button>

        {/* Raise Hand toggle */}
        <button 
          onClick={() => setRaisedHand(!raisedHand)}
          className={`conf-control-btn ${raisedHand ? 'warning' : ''}`}
          title={raisedHand ? 'Lower Hand' : 'Raise Hand'}
        >
          <i className="fa-solid fa-hand"></i>
        </button>

        {/* Reaction selector pop-up hover menu */}
        <div className="reaction-pop-trigger">
          <button 
            className="conf-control-btn"
            title="React"
          >
            <i className="fa-solid fa-face-smile"></i>
          </button>
          
          <div className="reactions-popup-tray">
            {['👍', '❤️', '👏', '😂', '🎉', '😮'].map(emoji => (
              <button
                key={emoji}
                onClick={() => triggerFloatingReaction(emoji)}
                className="reactions-popup-btn"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Toggle Chat Sidebar */}
        <button 
          onClick={() => { setShowChat(!showChat); setShowParticipants(false); }}
          className={`conf-control-btn ${showChat ? 'active' : ''}`}
          title="Meeting Chat"
        >
          <i className="fa-solid fa-comments"></i>
        </button>

        {/* Toggle Participants list */}
        <button 
          onClick={() => { setShowParticipants(!showParticipants); setShowChat(false); }}
          className={`conf-control-btn ${showParticipants ? 'active' : ''}`}
          title="Participants"
        >
          <i className="fa-solid fa-users"></i>
        </button>

        <div className="conf-control-divider"></div>

        {/* Red Leave button */}
        <button 
          onClick={handleLeaveConference}
          className="conf-leave-btn"
        >
          <i className="fa-solid fa-phone-slash"></i> Leave
        </button>

      </div>

      <AddParticipantModal 
        isOpen={showAddMember} 
        onClose={() => setShowAddMember(false)} 
        onAddMember={handleAddMember}
        usersCache={usersCache}
        currentUser={currentUser}
      />

    </div>
  );
}
