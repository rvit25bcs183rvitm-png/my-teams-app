import React, { useState, useEffect, useRef } from 'react';
import CallManager from '../services/CallManager';
import AddParticipantModal from './AddParticipantModal';
import { BASE_URL } from '../config';

export default function CallOverlay({ activeCall, onHangUp, currentUser, token, callHubConnection, onMinimize, setActiveCall, usersCache, conversations }) {
  const [callState, setCallState] = useState('ringing'); // 'ringing' | 'incoming' | 'connecting' | 'connected' | 'ended'
  const [seconds, setSeconds] = useState(0);
  
  const [isVideoEnabled, setIsVideoEnabled] = useState(activeCall?.isVideo || false);
  const [isMuted, setIsMuted] = useState(false);
  const [raisedHand, setRaisedHand] = useState(false);
  const [backgroundEffect, setBackgroundEffect] = useState('none'); // 'none' | 'blur' | 'virtual'
  
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [remoteScreens, setRemoteScreens] = useState(new Map());
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [isVirtualBackground, setIsVirtualBackground] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState({
    state: 'direct',
    typeLabel: 'Direct P2P (STUN)',
    quality: 'Excellent',
    rtt: 0,
    packetsLost: 0
  });

  // Voicemail state
  const [isVoicemailMode, setIsVoicemailMode] = useState(false);
  const [voicemailStep, setVoicemailStep] = useState('idle'); // 'idle' | 'greeting' | 'recording' | 'sending' | 'sent' | 'failed'
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  const isVoicemailModeRef = useRef(isVoicemailMode);
  useEffect(() => {
    isVoicemailModeRef.current = isVoicemailMode;
  }, [isVoicemailMode]);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  const localVideoRef = useRef(null);
  const timerRef = useRef(null);
  const callInitiatedRef = useRef(false);

  // Initialize CallManager when connected
  useEffect(() => {
    if (!activeCall || !callHubConnection) return;

    CallManager.init(callHubConnection, currentUser, token);

    const handleLocalStreamChanged = (stream) => setLocalStream(stream);
    const handleConnectionQuality = (qualityData) => setConnectionQuality(qualityData);
    const handleRemoteTrackAdded = (userId, stream) => {
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.set(userId, stream);
        return next;
      });
    };
    const handlePeerDisconnected = (userId) => {
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
      setRemoteScreens(prev => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    };
    const handleRemoteScreenAdded = (userId, stream) => {
      setRemoteScreens(prev => {
        const next = new Map(prev);
        next.set(userId, stream);
        return next;
      });
    };
    const handleRemoteScreenRemoved = (userId) => {
      setRemoteScreens(prev => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    };
    const handleVideoChanged = (enabled) => setIsVideoEnabled(enabled);
    const handleMutedChanged = (muted) => setIsMuted(muted);
    const handleScreenShareChanged = (sharing) => {
        setIsScreenSharing(sharing);
        setLocalScreenStream(CallManager.screenStream);
    };
    const handleVirtualBgChanged = (vb) => setIsVirtualBackground(vb);
    const handleCallEnded = () => {
      if (isVoicemailModeRef.current) return;
      cleanupCall();
      onHangUp();
    };
    const handleForcedDisconnect = () => {
      alert("You have been removed from the call.");
      cleanupCall();
      onHangUp();
    };

    CallManager.on('local_stream_changed', handleLocalStreamChanged);
    CallManager.on('connection_quality', handleConnectionQuality);
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

    // Initial state sync
    setIsVideoEnabled(CallManager.isVideoEnabled);
    setIsMuted(CallManager.isMuted);
    setIsScreenSharing(CallManager.isScreenSharing);
    setLocalScreenStream(CallManager.screenStream);
    setIsVirtualBackground(CallManager.isVirtualBackground);

    return () => {
      CallManager.off('local_stream_changed', handleLocalStreamChanged);
      CallManager.off('connection_quality', handleConnectionQuality);
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
      CallManager.cleanup();

      // Voicemail cleanup
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {}
      }
    };
  }, [callHubConnection]);

  // Watch activeCall state changes to initiate or join
  useEffect(() => {
    if (!activeCall || !callHubConnection) return;

    if (!activeCall.status && !activeCall.id) {
      if (callInitiatedRef.current) return;
      callInitiatedRef.current = true;
      setCallState('ringing');
      // Initialize local stream so caller can see themselves while it rings
      CallManager.isVideoEnabled = activeCall.isVideo || false;
      CallManager.initializeLocalStream().catch(e => console.error(e));

      const startCallSession = async () => {
        try {
          if (activeCall.isInstantStart) {
            setCallState('connecting');
            await callHubConnection.invoke("StartInstantMeeting");
          } else if (activeCall.joinCode) {
            setCallState('connecting');
            await callHubConnection.invoke("JoinMeetingById", activeCall.joinCode);
            // Response comes back via CallAccepted event
          } else if (activeCall.type === 'group' && activeCall.conversationId) {
            // Validate conversationId is a GUID before invoking StartGroupCall
            const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (guidRegex.test(activeCall.conversationId)) {
              await callHubConnection.invoke("StartGroupCall", activeCall.conversationId);
            } else {
              console.error("Invalid conversationId for group call:", activeCall.conversationId);
              alert("To start an instant meeting, please open a group conversation and start the call from there.");
              onHangUp();
              return;
            }
          } else if (activeCall.user?.id) {
            const targetId = activeCall.user.id.toLowerCase();
            const callee = Object.values(usersCache || {}).find(u => u && u.id && u.id.toLowerCase() === targetId);
            const calleeStatus = callee ? callee.status : (Object.keys(usersCache || {}).length > 0 ? 'offline' : 'online');
            const isExplicitlyUnavailable = calleeStatus && ['busy', 'away', 'donotdisturb', 'dnd', 'offline'].includes(calleeStatus.toLowerCase());
            
            if (isExplicitlyUnavailable) {
              setCallState('ringing');
              setTimeout(() => {
                triggerVoicemailFlow();
              }, 3000);
            } else {
              const callType = activeCall.isVideo ? "Video" : "Audio";
              await callHubConnection.invoke("StartCall", activeCall.user.id, callType);
            }
          } else {
            console.error("Cannot start call: no targetUserId or conversationId");
            alert("Please select a contact or group to call.");
            onHangUp();
          }
        } catch (err) {
          console.error("Failed to start call:", err);
          alert(`Failed to start call: ${err.message || err}`);
          onHangUp();
        }
      };

      startCallSession();
    } else if (activeCall.status === 'incoming') {
      setCallState('incoming');
    } else if (activeCall.status === 'ringing') {
      setCallState('ringing');
      // Initialize local stream so caller can see themselves while it rings
      CallManager.isVideoEnabled = activeCall.isVideo;
      CallManager.initializeLocalStream().catch(e => console.error(e));
    } else if (activeCall.status === 'connecting') {
      setCallState('connecting');
    } else if (activeCall.status === 'connected') {
      setCallState('connecting');

      // For joiners (isReceiver) with no known members, pass empty list - 
      // CallManager will wait for incoming offers from existing participants.
      // For callers, we know the specific target.
      let targetUserIds = [];
      if (activeCall.isGroup || activeCall.type === 'group') {
        targetUserIds = activeCall.members || [];
      } else {
        targetUserIds = [activeCall.user?.id].filter(Boolean);
      }
      
      // The caller initiates offers. The receiver waits for them.
      const sendOffers = !activeCall.isReceiver;

      CallManager.joinCall(activeCall.id, targetUserIds, activeCall.isVideo, sendOffers)
        .then(() => {
          setCallState('connected');
          if (setActiveCall) setActiveCall(prev => prev ? { ...prev, status: 'connected' } : prev);
        })
        .catch(e => {
          console.error("Join call failed", e);
          onHangUp();
        });
    }

  }, [activeCall?.status, activeCall?.id, !!callHubConnection]);


  // Sync local stream to video ref
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isVideoEnabled]);

  // Voicemail triggers & effects
  useEffect(() => {
    if (activeCall?.status === 'rejected' && !isVoicemailMode) {
      triggerVoicemailFlow();
    }
  }, [activeCall?.status]);

  useEffect(() => {
    let timeoutId = null;
    if (callState === 'ringing' && !activeCall?.isReceiver && !isVoicemailMode) {
      timeoutId = setTimeout(() => {
        triggerVoicemailFlow();
      }, 15000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [callState, activeCall, isVoicemailMode]);

  const triggerVoicemailFlow = () => {
    isVoicemailModeRef.current = true;
    setIsVoicemailMode(true);
    setVoicemailStep('greeting');

    try {
      CallManager.leaveCall();
    } catch (e) {
      console.warn("Error leaving call for voicemail transition:", e);
    }
    
    const calleeName = activeCall.user?.displayName || activeCall.user?.username || "The user";
    const greetingText = `Record your message. ${calleeName} is not available. Please record your message.`;
    
    const playBeep = () => {
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
        
        oscillator.start();
        setTimeout(() => {
          oscillator.stop();
          audioCtx.close();
        }, 500);
      } catch (err) {
        console.warn("Failed to play voicemail beep:", err);
      }
    };

    // Safety fallback timer for SpeechSynthesis in case mobile blocks it silently
    let fallbackTimeout = setTimeout(() => {
      console.log("[Voicemail] Speech synthesis safety fallback triggered");
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      playBeep();
      startVoicemailRecording();
    }, 4500);

    const utterance = new SpeechSynthesisUtterance(greetingText);
    utterance.onend = () => {
      clearTimeout(fallbackTimeout);
      playBeep();
      setTimeout(() => {
        startVoicemailRecording();
      }, 600);
    };
    utterance.onerror = (e) => {
      clearTimeout(fallbackTimeout);
      console.warn("Speech synthesis failed, initiating recording fallback", e);
      playBeep();
      setTimeout(() => {
        startVoicemailRecording();
      }, 600);
    };
    
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } else {
      clearTimeout(fallbackTimeout);
      playBeep();
      setTimeout(() => {
        startVoicemailRecording();
      }, 600);
    }
  };

  const startVoicemailRecording = async () => {
    try {
      setVoicemailStep('recording');
      setRecordingSeconds(0);
      setIsRecording(true);
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        await uploadVoicemail();
      };

      mediaRecorder.start();

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(s => {
          if (s >= 59) {
            stopVoicemailRecording();
            return 60;
          }
          return s + 1;
        });
      }, 1000);

    } catch (err) {
      console.error("Failed to start voicemail recording:", err);
      alert("Microphone access is required to record voicemails.");
      setIsVoicemailMode(false);
      setVoicemailStep('idle');
      onHangUp();
    }
  };

  const stopVoicemailRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const uploadVoicemail = async () => {
    if (audioChunksRef.current.length === 0) {
      console.warn("No audio data, skipping upload.");
      onHangUp();
      return;
    }

    setVoicemailStep('sending');

    try {
      let fileType = 'audio/webm';
      let extension = '.webm';

      if (mediaRecorderRef.current && mediaRecorderRef.current.mimeType) {
        fileType = mediaRecorderRef.current.mimeType;
        if (fileType.includes('mp4') || fileType.includes('m4a') || fileType.includes('quicktime')) {
          extension = '.mp4';
        } else if (fileType.includes('ogg')) {
          extension = '.ogg';
        } else if (fileType.includes('wav')) {
          extension = '.wav';
        }
      }

      const audioBlob = new Blob(audioChunksRef.current, { type: fileType });
      const audioFile = new File([audioBlob], `voicemail-${Date.now()}${extension}`, { type: fileType });

      let conversationId = null;

      try {
        const cRes = await fetch(`${BASE_URL}/api/conversations`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (cRes.ok) {
          const convList = await cRes.json();
          const targetId = activeCall.user?.id?.toLowerCase();
          const targetUsername = activeCall.user?.username?.toLowerCase();
          
          const existingDm = convList.find(c => {
            const isDm = c.type === 'DirectMessage' || c.type === 'dm' || c.type === 'directmessage';
            if (!isDm) return false;
            return c.members && c.members.some(m => 
              m.userId?.toLowerCase() === targetId || 
              m.username?.toLowerCase() === targetUsername ||
              (typeof m === 'object' && m !== null && (m.id?.toLowerCase() === targetId || m.name?.toLowerCase() === targetUsername))
            );
          });
          conversationId = existingDm?.id;
        }
      } catch (err) {
        console.warn("Failed fetching fresh conversations for voicemail:", err);
      }

      if (!conversationId && conversations) {
        const targetId = activeCall.user?.id?.toLowerCase();
        const existingDm = Object.values(conversations).find(c => 
          c && (c.type === 'dm' || c.type === 'DirectMessage') && 
          c.memberDetails && c.memberDetails.some(m => m.userId?.toLowerCase() === targetId)
        );
        conversationId = existingDm?.id;
      }

      if (!conversationId && activeCall.user?.id) {
        const createRes = await fetch(`${BASE_URL}/api/conversations`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            type: "DirectMessage",
            memberIds: [activeCall.user.id]
          })
        });
        if (createRes.ok) {
          const newConv = await createRes.json();
          conversationId = newConv.id;
        }
      }

      if (!conversationId) {
        throw new Error("Could not find or establish a direct conversation for voicemail.");
      }

      const formData = new FormData();
      formData.append('file', audioFile);
      formData.append('conversationId', conversationId);

      const uploadRes = await fetch(`${BASE_URL}/api/messages/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (uploadRes.ok) {
        setVoicemailStep('sent');
        setTimeout(() => {
          onHangUp();
        }, 2000);
      } else {
        throw new Error("Failed to upload voicemail.");
      }

    } catch (err) {
      console.error("Voicemail upload error:", err);
      setVoicemailStep('failed');
      setTimeout(() => {
        onHangUp();
      }, 2000);
    }
  };

  // Timer
  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [callState]);

  const cleanupCall = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleAccept = async () => {
    setCallState('connecting');
    if (setActiveCall) setActiveCall(prev => prev ? { ...prev, status: 'connecting', answeredLocally: true } : prev);

    try {
      if (callHubConnection && activeCall.id) {
        await callHubConnection.invoke("AcceptCall", activeCall.id);
      }
      
      const targetUserIds = activeCall.isGroup 
        ? activeCall.members || [activeCall.user?.id].filter(Boolean)
        : [activeCall.user?.id].filter(Boolean);

      // We wait for the caller to send an Offer via SignalR which CallManager handles automatically.
      CallManager.activeCallId = activeCall.id;
      CallManager.isVideoEnabled = activeCall.isVideo;
      await CallManager.initializeLocalStream();

      setCallState('connected');
      if (setActiveCall) setActiveCall(prev => prev ? { ...prev, status: 'connected', answeredLocally: true } : prev);

    } catch (e) {
      console.error("Accept failed", e);
      setCallState('incoming');
    }
  };

  const handleReject = async () => {
    if (callHubConnection && activeCall.id) {
      await callHubConnection.invoke("RejectCall", activeCall.id, "Declined");
    }
    onHangUp();
  };

  const handleAddMember = async (userId) => {
    if (callHubConnection && activeCall.id) {
       try {
           await callHubConnection.invoke("AddMemberToCall", activeCall.id, userId);
           if (setActiveCall) {
             setActiveCall(prev => prev ? { ...prev, isGroup: true } : prev);
           }
       } catch (err) {
           console.warn("Failed to add participant via Hub", err);
       }
    }
    setIsAddModalOpen(false);
  };

  const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const isPresentationMode = isScreenSharing || remoteScreens.size > 0;
  const presentationStream = isScreenSharing ? localScreenStream : (remoteScreens.size > 0 ? Array.from(remoteScreens.values())[0] : null);
  const presenterId = isScreenSharing ? currentUser?.id : (remoteScreens.size > 0 ? Array.from(remoteScreens.keys())[0] : null);
  const presenterUser = presenterId === currentUser?.id ? currentUser : (presenterId && usersCache ? usersCache[presenterId] || Object.values(usersCache).find(u => u && u.id && u.id.toLowerCase() === presenterId.toString().toLowerCase()) : null);

  if (!activeCall) return null;

  if (isVoicemailMode) {
    const callee = activeCall.user || { displayName: 'User' };
    const secondsStr = String(recordingSeconds % 60).padStart(2, '0');
    const minutesStr = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
    
    return (
      <div className="call-overlay glassmorphism-voicemail" style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(20, 20, 25, 0.95)', zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: '#fff', padding: '24px', backdropFilter: 'blur(20px)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', textAlign: 'center' }}>
          <div className="call-avatar-container" style={{ position: 'relative' }}>
            {voicemailStep === 'recording' && (
              <div style={{
                position: 'absolute', top: '-10px', left: '-10px', right: '-10px', bottom: '-10px',
                borderRadius: '50%', border: '3px solid #ef4444',
                animation: 'pulse 1.5s infinite'
              }}></div>
            )}
            <div className={`avatar text-avatar ${callee.avatarClass || 'avatar-gold'}`} style={{ width: '100px', height: '100px', fontSize: '2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', backgroundColor: 'var(--primary)' }}>
              {callee.letter || (callee.displayName || callee.username || 'U').charAt(0).toUpperCase()}
            </div>
          </div>

          <div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: '700', margin: '0 0 8px 0' }}>
              {callee.displayName || callee.username}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
              {voicemailStep === 'greeting' && "Voicemail Greeting playing..."}
              {voicemailStep === 'recording' && `Recording voicemail... ${minutesStr}:${secondsStr}`}
              {voicemailStep === 'sending' && "Uploading voicemail..."}
              {voicemailStep === 'sent' && "Voicemail sent successfully!"}
              {voicemailStep === 'failed' && "Failed to send voicemail."}
            </p>
          </div>

          {voicemailStep === 'recording' && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', height: '40px', margin: '20px 0' }}>
              {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((h, i) => (
                <div key={i} style={{
                  width: '4px',
                  backgroundColor: '#ef4444',
                  borderRadius: '2px',
                  animation: `waveform 0.8s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.1}s`,
                  height: `${h * 8}px`
                }}></div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '24px', marginTop: '30px' }}>
            {voicemailStep === 'recording' && (
              <>
                <button 
                  onClick={() => {
                    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
                    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                      mediaRecorderRef.current.onstop = () => {
                        setIsRecording(false);
                        onHangUp();
                      };
                      mediaRecorderRef.current.stop();
                    } else {
                      onHangUp();
                    }
                  }} 
                  style={{
                    width: '64px', height: '64px', borderRadius: '50%', border: 'none',
                    backgroundColor: '#ef4444', color: '#fff', fontSize: '1.4rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.15s ease'
                  }}
                  title="Discard Voicemail"
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <i className="fa-solid fa-trash"></i>
                </button>

                <button 
                  onClick={stopVoicemailRecording} 
                  style={{
                    width: '64px', height: '64px', borderRadius: '50%', border: 'none',
                    backgroundColor: '#10b981', color: '#fff', fontSize: '1.4rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.15s ease'
                  }}
                  title="Stop & Send Voicemail"
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <i className="fa-solid fa-check"></i>
                </button>
              </>
            )}

            {(voicemailStep === 'greeting' || voicemailStep === 'sending') && (
              <button 
                onClick={() => {
                  if (typeof window !== 'undefined' && window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                  }
                  onHangUp();
                }} 
                className="btn btn-secondary"
                style={{ padding: '10px 24px' }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <style dangerouslySetInnerHTML={{__html: `
          @keyframes waveform {
            0% { transform: scaleY(0.3); }
            100% { transform: scaleY(1); }
          }
          @keyframes pulse {
            0% { transform: scale(1); opacity: 0.8; }
            100% { transform: scale(1.3); opacity: 0; }
          }
        `}} />
      </div>
    );
  }

  const getConnectionQualityBadge = () => {
    let color = '#10b981';
    let text = 'Direct P2P (STUN)';
    let icon = 'fa-wifi';

    if (connectionQuality.state === 'relay') {
      color = '#f59e0b';
      text = 'Relayed via TURN';
      icon = 'fa-server';
    } else if (connectionQuality.state === 'reconnecting') {
      color = '#ef4444';
      text = 'Reconnecting';
      icon = 'fa-rotate';
    } else if (connectionQuality.state === 'failed') {
      color = '#ef4444';
      text = 'Connection Lost';
      icon = 'fa-circle-xmark';
    } else if (connectionQuality.typeLabel === 'Local Direct (LAN)') {
      color = '#10b981';
      text = 'Local Direct (LAN)';
      icon = 'fa-network-wired';
    }

    const qualityLevel = connectionQuality.quality || 'Excellent';
    const qualityColorMap = {
      'Excellent': '#10b981',
      'Good': '#3b82f6',
      'Fair': '#f59e0b',
      'Poor': '#ef4444',
      'Critical': '#7f1d1d'
    };
    const qColor = qualityColorMap[qualityLevel] || '#10b981';

    return (
      <div 
        className="connection-quality-badge" 
        style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'rgba(15, 15, 20, 0.85)',
          border: `1px solid ${color}`,
          color: '#e5e7eb',
          padding: '8px 12px',
          borderRadius: '8px',
          fontSize: '0.75rem',
          backdropFilter: 'blur(10px)',
          minWidth: '250px',
          gap: '4px',
          zIndex: 100
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', color, marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>
          <i className={`fa-solid ${icon}`}></i>
          <span>{text}</span>
          <span style={{ marginLeft: 'auto', backgroundColor: qColor, color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>{qualityLevel}</span>
          <button 
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '0 4px' }}
            title="Toggle Debug Panel"
          >
            <i className={`fa-solid ${showDebugPanel ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
          </button>
        </div>
        
        {showDebugPanel ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.7rem' }}>
            <div><span style={{opacity: 0.7}}>RTT:</span> {connectionQuality.rtt !== undefined ? Math.round(connectionQuality.rtt) : 0} ms</div>
            <div><span style={{opacity: 0.7}}>Loss:</span> {connectionQuality.lossPercentage || 0}%</div>
            <div><span style={{opacity: 0.7}}>Jitter:</span> {connectionQuality.jitter || 0} ms</div>
            <div><span style={{opacity: 0.7}}>Audio:</span> {connectionQuality.audioBitrate ? Math.round(connectionQuality.audioBitrate) : 0} kbps</div>
            <div><span style={{opacity: 0.7}}>Video:</span> {connectionQuality.videoBitrate ? Math.round(connectionQuality.videoBitrate) : 0} kbps</div>
            <div><span style={{opacity: 0.7}}>Total:</span> {connectionQuality.combinedBitrate ? Math.round(connectionQuality.combinedBitrate) : 0} kbps</div>
            <div><span style={{opacity: 0.7}}>Res:</span> {connectionQuality.resolution || 'N/A'}</div>
            <div><span style={{opacity: 0.7}}>FPS:</span> {connectionQuality.framerate || 0}</div>
            <div style={{ gridColumn: 'span 2' }}><span style={{opacity: 0.7}}>Pair:</span> {connectionQuality.candidateType || 'Unknown'}</div>
            <div style={{ gridColumn: 'span 2' }}><span style={{opacity: 0.7}}>Protocol:</span> {connectionQuality.transport ? connectionQuality.transport.toUpperCase() : 'UDP'}</div>
            <div style={{ gridColumn: 'span 2' }}><span style={{opacity: 0.7}}>ICE State:</span> {connectionQuality.iceState || 'checking'}</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
            <div><span style={{opacity: 0.7}}>RTT:</span> {connectionQuality.rtt !== undefined ? Math.round(connectionQuality.rtt) : 0} ms</div>
            <div><span style={{opacity: 0.7}}>Loss:</span> {connectionQuality.lossPercentage || 0}%</div>
            <div><span style={{opacity: 0.7}}>Bitrate:</span> {connectionQuality.combinedBitrate ? Math.round(connectionQuality.combinedBitrate) : 0} kbps</div>
            <div><span style={{opacity: 0.7}}>Res:</span> {connectionQuality.resolution || 'N/A'}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="call-overlay">
      
      {/* Header */}
      <div className="call-overlay-header">
        <div className="call-badges">
          <div className="e2e-badge">
            <i className="fa-solid fa-lock"></i> E2E Encrypted Mesh
          </div>
          {callState === 'connected' && getConnectionQualityBadge()}
          {activeCall.joinCode && (
            <div 
              className="meeting-id-badge" 
              style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
              onClick={() => {
                navigator.clipboard.writeText(activeCall.joinCode);
                alert("Meeting code copied to clipboard!");
              }}
              title="Click to copy meeting code"
            >
              <i className="fa-solid fa-hashtag"></i> ID: {activeCall.joinCode}
              <i className="fa-regular fa-copy" style={{ marginLeft: '4px', fontSize: '0.85em', opacity: 0.8 }}></i>
            </div>
          )}
        </div>
        {onMinimize && (
          <button onClick={onMinimize} className="btn icon-btn header-action-btn">
            <i className="fa-solid fa-compress"></i>
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="call-overlay-main">
        
        {callState === 'ringing' || callState === 'incoming' || callState === 'connecting' ? (
          <div className="call-ringing-state">
            <h2 className="call-title">
              {activeCall.isGroup ? "Group Call" : (activeCall.user?.username || activeCall.user?.displayName || activeCall.user?.name || '') || 'Unknown'}
            </h2>
            <p className="call-subtitle">
              {callState === 'ringing' && "Calling..."}
              {callState === 'incoming' && "Incoming Call..."}
              {callState === 'connecting' && <span><i className="fa-solid fa-circle-notch fa-spin"></i> Connecting Mesh...</span>}
            </p>
            <div className="call-avatar-container">
               <div className={`avatar text-avatar ${activeCall.user?.avatarClass || 'avatar-gold'} call-main-avatar`}>
                  {activeCall.user?.letter || 'C'}
               </div>
            </div>
          </div>
        ) : isPresentationMode ? (
          /* Theater Mode Layout */
          <div className="theater-mode">
            <div className="presentation-view">
                <RemoteVideo stream={presentationStream} />
                <div className="presentation-label">
                  Viewing {presenterUser ? (presenterUser.username || presenterUser.displayName || presenterUser.name || 'Screen') : 'Screen'}
                </div>
            </div>
            <div className="bottom-strip-grid">
              {/* Local Stream Card in Strip */}
              <div className="video-card strip-card">
                {isVideoEnabled && localStream ? (
                  <video ref={localVideoRef} autoPlay playsInline muted className="video-element local-video" />
                ) : (
                  <div className={`avatar text-avatar ${currentUser?.avatarClass || 'avatar-blue'} video-card-avatar`}>
                    {(currentUser?.username || currentUser?.displayName || 'Y').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="video-label">
                  You {isMuted && <i className="fa-solid fa-microphone-slash label-icon"></i>}
                </div>
              </div>

              {/* Remote Streams Cards in Strip */}
              {Array.from(remoteStreams.entries()).map(([userId, stream]) => {
                const u = usersCache ? (usersCache[userId] || Object.values(usersCache).find(user => user && user.id && user.id.toLowerCase() === userId.toString().toLowerCase())) : null;
                return (
                  <div key={userId} className="video-card strip-card">
                    <RemoteVideo stream={stream} />
                    <div className="video-label">
                      {u ? (u.username || u.displayName || u.name || '') : userId}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          /* Grid View for Mesh */
          <div className="video-grid">
            
            {/* Local Stream Card */}
            <div className="video-card">
              {isVideoEnabled && localStream ? (
                <video ref={localVideoRef} autoPlay playsInline muted className="video-element local-video" />
              ) : (
                <div className={`avatar text-avatar ${currentUser?.avatarClass || 'avatar-blue'} video-card-avatar`}>
                  {(currentUser?.username || currentUser?.displayName || 'Y').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="video-label">
                You {isMuted && <i className="fa-solid fa-microphone-slash label-icon"></i>}
              </div>
            </div>

            {/* Remote Streams Cards */}
            {Array.from(remoteStreams.entries()).map(([userId, stream]) => {
               const u = usersCache ? (usersCache[userId] || Object.values(usersCache).find(user => user && user.id && user.id.toLowerCase() === userId.toString().toLowerCase())) : null;
               return (
                 <div key={userId} className="video-card">
                   <RemoteVideo stream={stream} />
                   <div className="video-label">
                     {u ? (u.username || u.displayName || u.name || '') : userId}
                   </div>
                 </div>
               )
            })}

          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="call-overlay-footer">
        {callState === 'incoming' ? (
          <div className="incoming-controls">
            <button onClick={handleAccept} className="control-btn control-btn-success">
              <i className="fa-solid fa-phone"></i>
            </button>
            <button onClick={handleReject} className="control-btn control-btn-danger">
              <i className="fa-solid fa-phone-slash"></i>
            </button>
          </div>
        ) : (
          <div className="call-controls">
            <span className="call-timer">{formatTime(seconds)}</span>
            
            <button onClick={() => CallManager.toggleMute()} className={`control-btn ${isMuted ? 'control-btn-active-danger' : ''}`}>
              <i className={`fa-solid ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
            </button>
            <button onClick={() => CallManager.toggleVideo()} className={`control-btn ${isVideoEnabled ? 'control-btn-active' : ''}`}>
              <i className={`fa-solid ${isVideoEnabled ? 'fa-video' : 'fa-video-slash'}`}></i>
            </button>
            <button onClick={() => CallManager.toggleScreenShare()} className={`control-btn ${isScreenSharing ? 'control-btn-active' : ''}`} title="Share Screen">
              <i className="fa-solid fa-desktop"></i>
            </button>
            <button onClick={() => CallManager.toggleVirtualBackground()} className={`control-btn ${isVirtualBackground ? 'control-btn-active' : ''}`} title="Virtual Background" disabled={!isVideoEnabled}>
              <i className="fa-solid fa-wand-magic-sparkles"></i>
            </button>
            
            {/* Add People Button */}
            <button onClick={() => setIsAddModalOpen(true)} className="control-btn" title="Add People">
              <i className="fa-solid fa-user-plus"></i>
            </button>

            <button onClick={() => CallManager.leaveCall()} className="control-btn control-btn-danger">
              <i className="fa-solid fa-phone-slash"></i>
            </button>
          </div>
        )}
      </div>

      <AddParticipantModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onAddMember={handleAddMember}
        usersCache={usersCache}
        currentUser={currentUser}
      />

    </div>
  );
}

// Sub-component to bind stream to a video element
function RemoteVideo({ stream }) {
  const ref = useRef(null);
  const [playError, setPlayError] = useState(false);
  
  useEffect(() => {
    if (ref.current && stream) {
      if (ref.current.srcObject !== stream) {
        ref.current.srcObject = stream;
      }
      const playPromise = ref.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          if (error.name === 'AbortError') {
             // This is fine, play was interrupted by a new stream or pause
             return;
          }
          console.warn('[WebRTC] Autoplay prevented for remote stream:', error);
          setPlayError(true);
        });
      }
    }
  }, [stream]);

  const hasVideo = stream?.getVideoTracks().length > 0;

  return (
    <>
      <video ref={ref} autoPlay playsInline className={`video-element ${hasVideo ? '' : 'hidden-video'}`} />
      {playError && (
          <div 
            className="autoplay-warning" 
            style={{ 
              position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)', 
              background: 'rgba(239,68,68,0.9)', color: 'white', padding: '6px 12px', 
              borderRadius: '6px', zIndex: 10, fontSize: '0.85rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }} 
            onClick={() => { 
              ref.current?.play().then(() => setPlayError(false)).catch(e => console.error(e)); 
            }}
          >
              <i className="fa-solid fa-volume-xmark"></i> Click to Enable Audio
          </div>
      )}
      {!hasVideo && (
        <div className="video-card-placeholder">
           <i className="fa-solid fa-phone"></i>
        </div>
      )}
    </>
  );
}
