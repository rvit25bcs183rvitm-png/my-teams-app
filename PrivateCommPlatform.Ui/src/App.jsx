import { useState, useEffect, useRef } from 'react';
import * as signalR from '@microsoft/signalr';

import LoginOverlay from './components/LoginOverlay';
import Sidebar from './components/Sidebar';
import ChatViewport from './components/ChatViewport';
import ChatDetails from './components/ChatDetails';
import TeamsSection from './components/TeamsSection';
import CallsSection from './components/CallsSection';
import CalendarView from './components/CalendarView';
import FilesVault from './components/FilesVault';
import CallOverlay from './components/CallOverlay';
import CallDialer from './components/CallDialer';
import ConferenceRoom from './components/ConferenceRoom';
import CreateChannelModal from './components/CreateChannelModal';
import CreateDmModal from './components/CreateDmModal';
import CreateGroupModal from './components/CreateGroupModal';
import AddParticipantModal from './components/AddParticipantModal';
import MessageContextMenu from './components/MessageContextMenu';
import SettingsModal from './components/SettingsModal';
import ActivitySection from './components/ActivitySection';
import MeetingsSection from './components/MeetingsSection';
import NotificationsSection from './components/NotificationsSection';
import SettingsSection from './components/SettingsSection';
import AdminPanel from './components/AdminPanel';
import BillingSection from './components/BillingSection';
import { BASE_URL, SIGNALR_URL } from './config';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [currentUser, setCurrentUser] = useState(null);
  const [conversations, setConversations] = useState({});
  const [activeChatId, setActiveChatId] = useState(null);
  const [usersCache, setUsersCache] = useState({});
  const [activeTab, setActiveTab] = useState('chat');
  const [presenceStatus, setPresenceStatus] = useState('Online');
  const [filterKeyword, setFilterKeyword] = useState('');
  const [mobileSidebarActive, setMobileSidebarActive] = useState(false);
  const [favoriteConvIds, setFavoriteConvIds] = useState([]);
  const [callSubTab, setCallSubTab] = useState('recent');
  
  // Call state
  const [activeCall, setActiveCall] = useState(null);
  const [showCallDialer, setShowCallDialer] = useState(false);
  
  // UI State
  const [showDetails, setShowDetails] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [showDmModal, setShowDmModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false);
  const [pendingCallAfterGroupCreate, setPendingCallAfterGroupCreate] = useState(false);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, messageId: null });
  const [replyMessageId, setReplyMessageId] = useState(null);
  const [editMessageId, setEditMessageId] = useState(null);
  const [toast, setToast] = useState(null);
  const [upcomingMeetingPrompt, setUpcomingMeetingPrompt] = useState(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(prev => prev && prev.message === message ? null : prev);
    }, 4000);
  };

  const connectionRef = useRef(null);
  const callHubConnectionRef = useRef(null);
  const [callHubConnection, setCallHubConnection] = useState(null);
  const usersCacheRef = useRef(usersCache);
  const activeChatIdRef = useRef(activeChatId);
  const currentUserRef = useRef(currentUser);
  const conversationsRef = useRef(conversations);
  const warnedMeetingsRef = useRef(new Set());
  const presenceStatusRef = useRef(presenceStatus);

  useEffect(() => {
    presenceStatusRef.current = presenceStatus;
  }, [presenceStatus]);

  useEffect(() => {
    if (!token || !currentUser) return;
    const updatePresenceOnServer = async () => {
      try {
        await fetch(`${BASE_URL}/api/presence/status`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: presenceStatus })
        });
      } catch (err) {
        console.warn("Failed to update presence status on server:", err);
      }
    };
    updatePresenceOnServer();
  }, [presenceStatus, token, !!currentUser]);

  useEffect(() => {
    usersCacheRef.current = usersCache;
  }, [usersCache]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const decodeJwt = (tokenStr) => {
    try {
      const base64Url = tokenStr.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (token) {
      initializeDashboard();
    }
  }, [token]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          console.log("Notification permission state on mount:", permission);
        }).catch(() => {});
      }
    }
    const requestNotificationPermission = () => {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default') {
          Notification.requestPermission().then(permission => {
            console.log("Notification permission state on click:", permission);
          }).catch(() => {});
        }
      }
    };
    window.addEventListener('click', requestNotificationPermission);
    return () => window.removeEventListener('click', requestNotificationPermission);
  }, []);

  // Background loop to monitor upcoming scheduled meetings (runs every 30 seconds)
  useEffect(() => {
    if (!currentUser) return;

    const checkUpcomingMeetings = () => {
      // Gather all meetings (localStorage + scanned from conversations messages)
      const savedMeetings = localStorage.getItem(`meetings_${currentUser?.id}`);
      let localList = savedMeetings ? JSON.parse(savedMeetings) : [];

      const messageMeetings = [];
      const cancelledMeetingIds = new Set();
      const startedMeetingCodes = {}; // meetingId -> joinCode
      const convs = conversationsRef.current;
      if (convs) {
        Object.values(convs).forEach(conv => {
          if (conv && conv.messages) {
            conv.messages.forEach(msg => {
              if (msg.content && msg.content.startsWith('[MEETING_SCHEDULED]:')) {
                try {
                  const dataStr = msg.content.substring('[MEETING_SCHEDULED]:'.length);
                  const meetingData = JSON.parse(dataStr);
                  messageMeetings.push({
                    id: meetingData.id || msg.id,
                    title: meetingData.title,
                    date: meetingData.date,
                    time: meetingData.time,
                    duration: meetingData.duration,
                    type: meetingData.type,
                    description: meetingData.description,
                    invitees: meetingData.invitees || [],
                    organizerId: msg.senderId,
                    conversationId: msg.conversationId
                  });
                } catch (e) {}
              } else if (msg.content && msg.content.startsWith('[MEETING_CANCELLED]:')) {
                try {
                  const dataStr = msg.content.substring('[MEETING_CANCELLED]:'.length);
                  const cancelData = JSON.parse(dataStr);
                  if (cancelData.id) {
                    cancelledMeetingIds.add(cancelData.id);
                  }
                } catch (e) {}
              } else if (msg.content && msg.content.startsWith('[MEETING_STARTED]:')) {
                try {
                  const dataStr = msg.content.substring('[MEETING_STARTED]:'.length);
                  const startedData = JSON.parse(dataStr);
                  if (startedData.id && startedData.joinCode) {
                    startedMeetingCodes[startedData.id] = startedData.joinCode;
                  }
                } catch (e) {}
              }
            });
          }
        });
      }

      const combined = [];
      localList.forEach(l => {
        if (!cancelledMeetingIds.has(l.id)) {
          if (startedMeetingCodes[l.id]) {
            l.joinCode = startedMeetingCodes[l.id];
          }
          combined.push(l);
        }
      });
      messageMeetings.forEach(mm => {
        if (!cancelledMeetingIds.has(mm.id)) {
          if (startedMeetingCodes[mm.id]) {
            mm.joinCode = startedMeetingCodes[mm.id];
          }
          const existing = combined.find(c => c.id === mm.id);
          if (!existing) {
            combined.push(mm);
          } else {
            if (!existing.conversationId) {
              existing.conversationId = mm.conversationId;
            }
            if (mm.joinCode) {
              existing.joinCode = mm.joinCode;
            }
          }
        }
      });

      // Scan for meetings starting in ~5 minutes
      const now = Date.now();
      combined.forEach(meet => {
        if (!meet.date || !meet.time) return;
        
        try {
          const dateSeparator = meet.date.includes('-') ? '-' : '/';
          const [year, month, day] = meet.date.split(dateSeparator).map(Number);
          const [hours, minutes] = meet.time.split(':').map(Number);
          const meetingDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
          
          const diffMs = meetingDate.getTime() - now;
          const diffMins = diffMs / 60000;
          const durationMins = Number(meet.duration) || 30;

          // Check if it starts within 5 minutes or is currently active (within duration)
          if (diffMins <= 5.0 && diffMins >= -durationMins && !warnedMeetingsRef.current.has(meet.id)) {
            warnedMeetingsRef.current.add(meet.id);

            const isFuture = diffMins > 0;
            const bodyText = isFuture ? `Starts in ${Math.round(diffMins)} minutes at ${meet.time}.` : `Meeting is currently active.`;

            // Only prompt auto-join/start for the organizer (case-insensitive)
            const isOrganizer = meet.organizerId && currentUser?.id && 
              meet.organizerId.toLowerCase() === currentUser.id.toLowerCase();

            // Trigger native notification
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              const notification = new Notification(`Upcoming Meeting: ${meet.title}`, {
                body: bodyText + " Click to join.",
                icon: '/favicon.ico'
              });
              notification.onclick = () => {
                window.focus();
                setActiveCall({
                  conversationId: meet.conversationId || meet.id,
                  user: { displayName: meet.title },
                  isVideo: meet.type === 'Video',
                  type: 'group',
                  meetingId: meet.id,
                  isOrganizer: isOrganizer,
                  joinCode: meet.joinCode
                });
              };
            }

            if (isOrganizer) {
              setUpcomingMeetingPrompt({
                id: meet.id,
                title: meet.title,
                time: meet.time,
                conversationId: meet.conversationId,
                type: meet.type,
                isOrganizer: true,
                duration: meet.duration,
                meetingDate: meetingDate.getTime()
              });
            }
          }
        } catch (err) {
          console.error("Error checking meeting time", meet, err);
        }
      });
    };

    checkUpcomingMeetings();
    const intervalId = setInterval(checkUpcomingMeetings, 30000);

    return () => clearInterval(intervalId);
  }, [currentUser]);

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const fetchUsersList = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/users`, { headers: authHeaders });
      let presences = {};
      try {
        const pRes = await fetch(`${BASE_URL}/api/presence`, { headers: authHeaders });
        if (pRes.ok) {
          presences = await pRes.json();
        }
      } catch (pe) {
        console.warn("Failed to fetch initial presence list", pe);
      }

      if (res.ok) {
        const users = await res.json();
        const cache = {};
        const avatarClasses = ['avatar-purple', 'avatar-blue', 'avatar-teal', 'avatar-gold', 'avatar-red', 'avatar-green', 'avatar-pink'];
        users.forEach((u, index) => {
          u.letter = (u.displayName || u.username || 'U').charAt(0).toUpperCase();
          u.avatarClass = avatarClasses[index % avatarClasses.length];
          const userPres = presences[u.id] || presences[u.id.toUpperCase()] || presences[u.id.toLowerCase()];
          u.status = userPres || 'Offline';
          cache[u.id] = u;
          cache[u.username] = u; // fallback
        });
        setUsersCache(cache);
        return cache;
      }
    } catch (e) {
      console.error(e);
    }
    return {};
  };

  const fetchConversations = async (currentUsersCache = null, activeUser = null) => {
    const cacheToUse = currentUsersCache || usersCache;
    const userToUse = activeUser || currentUser;
    try {
      const res = await fetch(`${BASE_URL}/api/conversations`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        const processed = {};
        data.forEach(c => {
          if (!c) return;

          // Map memberDetails
          const memberDetails = (c.members || []).map(m => {
            const u = m.user || cacheToUse[m.userId];
            return {
              userId: m.userId,
              role: m.role || 'Employee',
              displayName: u?.displayName || u?.username || 'User',
              username: u?.username || 'user'
            };
          });

          // Map members (array of username strings)
          const members = memberDetails.map(m => m.username);

          // Normalize type to lowercase short form for frontend consistency
          let normalizedType = c.type;
          if (c.type === 'DirectMessage' || c.type === 'dm' || c.type === 'directmessage') normalizedType = 'dm';
          else if (c.type === 'GroupChat' || c.type === 'group' || c.type === 'groupchat') normalizedType = 'group';
          else if (c.type === 'Channel' || c.type === 'channel') normalizedType = 'channel';

          // Map DM name
          let name = c.name;
          if (normalizedType === 'dm') {
            const otherMember = memberDetails.find(m => m.userId.toLowerCase() !== (userToUse?.id || '').toLowerCase());
            name = otherMember ? otherMember.displayName : 'Direct Message';
          }

          processed[c.id] = {
            ...c,
            type: normalizedType,
            name,
            members,
            memberDetails
          };
        });
        setConversations(processed);
        return processed;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  const normalizeMessage = (m) => {
    if (!m) return m;
    
    // Normalize casing for all top-level keys
    const normalized = {
      id: m.id || m.Id,
      conversationId: m.conversationId || m.ConversationId,
      senderId: m.senderId || m.SenderId,
      senderDisplayName: m.senderDisplayName || m.SenderDisplayName,
      type: m.type || m.Type,
      content: m.content || m.Content,
      createdDate: m.createdDate || m.CreatedDate,
      timestamp: m.timestamp || m.Timestamp || m.createdDate || m.CreatedDate,
      parentMessageId: m.parentMessageId || m.ParentMessageId,
      forwardedFromMessageId: m.forwardedFromMessageId || m.ForwardedFromMessageId,
      isEdited: m.isEdited !== undefined ? m.isEdited : m.IsEdited,
      isDeleted: m.isDeleted !== undefined ? m.isDeleted : m.IsDeleted,
      reactions: m.reactions || m.Reactions,
    };

    const attachments = m.attachments || m.Attachments;
    if (attachments && attachments.length > 0) {
      const raw = attachments[0];
      normalized.attachment = {
        id: raw.id || raw.Id,
        fileName: raw.fileName || raw.FileName,
        fileType: raw.fileType || raw.FileType,
        fileSize: raw.fileSize || raw.FileSize,
        storagePath: raw.storagePath || raw.StoragePath
      };
    }
    
    return normalized;
  };

  const fetchMessageHistory = async (chatId) => {
    try {
      const res = await fetch(`${BASE_URL}/api/conversations/${chatId}/messages`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        const mappedData = data.map(normalizeMessage);
        setConversations(prev => ({
          ...prev,
          [chatId]: {
            ...prev[chatId],
            messages: mappedData
          }
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const broadcastMeetingStarted = async (meetingId, joinCode, title) => {
    if (!currentUser) return;
    const savedMeetings = localStorage.getItem(`meetings_${currentUser?.id}`);
    const localList = savedMeetings ? JSON.parse(savedMeetings) : [];
    const meeting = localList.find(m => m.id === meetingId);
    if (!meeting || !meeting.invitees || meeting.invitees.length === 0) return;

    for (const inviteeId of meeting.invitees) {
      try {
        let existingDm = Object.values(conversationsRef.current || {}).find(c => 
          c && c.type === 'dm' && 
          c.memberDetails && c.memberDetails.some(m => m.userId.toLowerCase() === inviteeId.toLowerCase())
        );

        let conversationId = existingDm?.id;

        if (!conversationId) {
          const createRes = await fetch(`${BASE_URL}/api/conversations`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              type: "DirectMessage",
              memberIds: [inviteeId]
            })
          });
          if (createRes.ok) {
            const newConv = await createRes.json();
            conversationId = newConv.id;
          }
        }

        if (conversationId) {
          await fetch(`${BASE_URL}/api/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              conversationId: conversationId,
              content: `[MEETING_STARTED]:${JSON.stringify({ id: meetingId, joinCode: joinCode, title: title, organizerName: currentUser?.displayName || currentUser?.username })}`,
              type: "System"
            })
          });
        }
      } catch (err) {
        console.error("Failed to send meeting start message to invitee", inviteeId, err);
      }
    }
    initializeDashboard();
  };

  const initializeDashboard = async () => {
    if (!token) return;
    const decoded = decodeJwt(token);
    if (!decoded) return;

    const userId = decoded.sub || decoded.id || decoded.nameid || decoded["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"];
    const tokenUsername = decoded.unique_name || decoded.username || decoded.name || decoded["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"];

    // 1. Fetch fresh user list & cache it
    const freshUsersCache = await fetchUsersList();

    // 2. Fetch/update current user details from /api/users/{id}
    let activeUser = {
      id: userId,
      username: tokenUsername,
      displayName: freshUsersCache[userId]?.displayName || tokenUsername || 'User',
      role: freshUsersCache[userId]?.role || decoded.role || decoded["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] || 'Employee'
    };

    try {
      const res = await fetch(`${BASE_URL}/api/users/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const dbUser = await res.json();
        dbUser.letter = (dbUser.displayName || dbUser.username || 'U').charAt(0).toUpperCase();
        dbUser.avatarClass = 'avatar-purple';
        activeUser = {
          id: dbUser.id,
          username: dbUser.username,
          displayName: dbUser.displayName || dbUser.username || 'User',
          role: dbUser.role || 'Employee',
          email: dbUser.email,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName
        };
        freshUsersCache[dbUser.id] = dbUser;
        freshUsersCache[dbUser.username] = dbUser;
        setUsersCache({ ...freshUsersCache });
      }
    } catch (e) {
      console.error("Failed to fetch fresh user profile details during initialization", e);
    }

    setCurrentUser(activeUser);
    const myPres = freshUsersCache[userId]?.status;
    if (myPres) {
      setPresenceStatus(myPres);
    }

    // 3. Fetch conversations using the fresh context
    const processedConvs = await fetchConversations(freshUsersCache, activeUser);
    if (processedConvs) {
      // Fetch message histories for all conversations to populate calendar scanning
      Object.keys(processedConvs).forEach(id => {
        fetchMessageHistory(id);
      });
    }
  };

  useEffect(() => {
    if (activeChatId && token && conversations[activeChatId]) {
      fetchMessageHistory(activeChatId);
    }
  }, [activeChatId, token, !!conversations[activeChatId]]);

  // Track which conversation groups we've already joined to avoid re-joining
  const joinedGroupsRef = useRef(new Set());

  // SignalR Chat Hub
  useEffect(() => {
    if (!token) return;
    if (!connectionRef.current) {
      const conn = new signalR.HubConnectionBuilder()
        .withUrl(`${SIGNALR_URL}/chathub?access_token=${token}`)
        .withAutomaticReconnect()
        .build();

      conn.on("ReceiveMessage", (msg) => {
        const normalizedMsg = normalizeMessage(msg);
        
        // Intercept [MEETING_SCHEDULED]: messages
        if (normalizedMsg.content && normalizedMsg.content.startsWith('[MEETING_SCHEDULED]:') && normalizedMsg.senderId !== currentUserRef.current?.id) {
          try {
            const dataStr = normalizedMsg.content.substring('[MEETING_SCHEDULED]:'.length);
            const meetingData = JSON.parse(dataStr);
            const organizer = usersCacheRef.current[normalizedMsg.senderId] || { displayName: 'Someone' };
            
            // Native notification if permitted
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              new Notification(`Meeting Invitation: ${meetingData.title}`, {
                body: `Arranged by ${organizer.displayName} for ${meetingData.date} @ ${meetingData.time}`,
                icon: '/favicon.ico'
              });
            }
            
            // In-app toast instead of blocking alert
            showToast(`New Meeting Invitation from ${organizer.displayName}: "${meetingData.title}"`, 'info');
          } catch (e) {
            console.error("Failed to parse real-time meeting schedule message", e);
          }
        }

        // Intercept [MEETING_STARTED]: messages
        if (normalizedMsg.content && normalizedMsg.content.startsWith('[MEETING_STARTED]:') && normalizedMsg.senderId !== currentUserRef.current?.id) {
          try {
            const dataStr = normalizedMsg.content.substring('[MEETING_STARTED]:'.length);
            const startedData = JSON.parse(dataStr);
            const organizerName = startedData.organizerName || 'The host';
            
            // Trigger native notification
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              const notification = new Notification("Meeting Started", {
                body: `${organizerName} has started meeting "${startedData.title || 'Meeting'}" and you can join`,
                icon: '/favicon.ico'
              });
              notification.onclick = () => {
                window.focus();
                setActiveCall({
                  joinCode: startedData.joinCode,
                  user: { displayName: startedData.title || 'Meeting' },
                  isVideo: true,
                  type: 'group'
                });
              };
            }
            
            showToast(`${organizerName} has started meeting "${startedData.title || 'Meeting'}"! Click to join.`, 'success');
          } catch (e) {
            console.error("Failed to parse real-time meeting started message", e);
          }
        }

        setConversations(prev => {
          const conv = prev[normalizedMsg.conversationId];
          if (!conv) {
            // Trigger background fetch for new conversations, then fetch messages for it
            fetchConversations().then((processed) => {
              if (processed && processed[normalizedMsg.conversationId]) {
                fetchMessageHistory(normalizedMsg.conversationId);
              }
            });
            return prev;
          }
          const exists = (conv.messages || []).find(m => m.id === normalizedMsg.id);
          if (exists) return prev;

          // Browser notification if app is hidden or looking at different chat
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            if (normalizedMsg.senderId !== currentUserRef.current?.id) {
              const sender = usersCacheRef.current[normalizedMsg.senderId] || { displayName: 'Someone' };
              const isVoicemail = (normalizedMsg.type || '').toLowerCase() === 'attachment' && normalizedMsg.attachment?.fileName?.startsWith('voicemail-');
              const body = isVoicemail ? "Left a voicemail" : (normalizedMsg.content || (normalizedMsg.attachment ? "Shared an attachment" : ""));
              
              if (!document.hasFocus() || document.hidden || activeChatIdRef.current !== normalizedMsg.conversationId) {
                const notification = new Notification(`New message from ${sender.displayName || sender.username}`, {
                  body,
                  icon: '/favicon.ico'
                });
                notification.onclick = () => {
                  window.focus();
                  if (isVoicemail) {
                    setActiveTab('calls');
                    setCallSubTab('voicemail');
                  } else {
                    setActiveChatId(normalizedMsg.conversationId);
                    setActiveTab('chat');
                  }
                };
              }
            }
          }

          return {
            ...prev,
            [normalizedMsg.conversationId]: {
              ...conv,
              messages: [...(conv.messages || []), normalizedMsg]
            }
          };
        });
      });

      conn.on("UserPresenceChanged", (userId, status) => {
        setUsersCache(prev => {
          const newCache = { ...prev };
          if (newCache[userId]) {
            const updated = { ...newCache[userId], status };
            newCache[userId] = updated;
            if (updated.username) {
              newCache[updated.username] = updated;
            }
          }
          return newCache;
        });
      });

      conn.on("MessageEdited", (msgId, conversationId, content) => {
        setConversations(prev => {
          const conv = prev[conversationId];
          if (!conv) return prev;
          const updatedMessages = (conv.messages || []).map(m => 
            m.id === msgId ? { ...m, content, isEdited: true } : m
          );
          return {
            ...prev,
            [conversationId]: { ...conv, messages: updatedMessages }
          };
        });
      });

      conn.on("MessageDeleted", (msgId, conversationId, deleteType) => {
        setConversations(prev => {
          const conv = prev[conversationId];
          if (!conv) return prev;
          let updatedMessages;
          if (deleteType === "Everyone") {
            updatedMessages = (conv.messages || []).map(m => 
              m.id === msgId ? { ...m, isDeleted: true, content: "This message was deleted" } : m
            );
          } else {
            updatedMessages = (conv.messages || []).filter(m => m.id !== msgId);
          }
          return {
            ...prev,
            [conversationId]: { ...conv, messages: updatedMessages }
          };
        });
      });

      conn.on("ReactionAdded", (msgId, conversationId, userId, emoji) => {
        setConversations(prev => {
          const conv = prev[conversationId];
          if (!conv) return prev;
          const updatedMessages = (conv.messages || []).map(m => {
            if (m.id !== msgId) return m;
            const reactions = { ...m.reactions };
            if (!reactions[emoji]) reactions[emoji] = [];
            if (!reactions[emoji].includes(userId)) {
              reactions[emoji] = [...reactions[emoji], userId];
            }
            return { ...m, reactions };
          });
          return {
            ...prev,
            [conversationId]: { ...conv, messages: updatedMessages }
          };
        });
      });

      conn.on("ReactionRemoved", (msgId, conversationId, userId, emoji) => {
        setConversations(prev => {
          const conv = prev[conversationId];
          if (!conv) return prev;
          const updatedMessages = (conv.messages || []).map(m => {
            if (m.id !== msgId) return m;
            const reactions = { ...m.reactions };
            if (reactions[emoji]) {
              reactions[emoji] = reactions[emoji].filter(id => id !== userId);
              if (reactions[emoji].length === 0) {
                delete reactions[emoji];
              }
            }
            return { ...m, reactions };
          });
          return {
            ...prev,
            [conversationId]: { ...conv, messages: updatedMessages }
          };
        });
      });

      // On reconnect, re-join all conversation groups
      conn.onreconnected(() => {
        console.log("Chat Hub reconnected — rejoining conversation groups");
        joinedGroupsRef.current.clear();
        // The useEffect below will re-join all groups when conversations change
      });

      conn.start()
        .then(() => console.log("Chat Hub connected"))
        .catch(e => console.error(e));

      connectionRef.current = conn;
    }

    return () => {
      // Don't disconnect on re-render to keep it persistent unless logging out
    };
  }, [token]);

  // Join SignalR groups for all conversations — ensures real-time delivery
  useEffect(() => {
    const conn = connectionRef.current;
    if (!conn || conn.state !== signalR.HubConnectionState.Connected) return;

    const convIds = Object.keys(conversations || {});
    convIds.forEach(id => {
      if (!joinedGroupsRef.current.has(id)) {
        conn.invoke("JoinConversation", id)
          .then(() => {
            joinedGroupsRef.current.add(id);
          })
          .catch(err => console.warn(`Failed to join group for ${id}:`, err));
      }
    });
  }, [conversations]);

  // SignalR Call Hub
  useEffect(() => {
    if (!token || !currentUser) return;

    if (!callHubConnectionRef.current) {
      const conn = new signalR.HubConnectionBuilder()
        .withUrl(`${SIGNALR_URL}/callhub?access_token=${token}`)
        .withAutomaticReconnect()
        .build();

      conn.on("IncomingCall", (data) => {
        const isUnavailable = ['busy', 'away', 'donotdisturb', 'dnd', 'offline'].includes(presenceStatusRef.current?.toLowerCase());
        if (isUnavailable) {
          console.log(`[App] Auto-rejecting call ${data.callId} because presence is ${presenceStatusRef.current}`);
          conn.invoke("RejectCall", data.callId, "Busy").catch(e => console.warn(e));
          return;
        }

        const callerMetadata = usersCacheRef.current[data.callerId] || {
          displayName: data.callerUsername,
          letter: data.callerUsername.charAt(0).toUpperCase(),
          avatarClass: "avatar-purple"
        };
        // Trigger native notification
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(`Incoming ${data.type} Call`, {
            body: `${callerMetadata.displayName} is calling you.`,
            icon: '/favicon.ico'
          });
        }

        setActiveCall({
          id: data.callId,
          user: {
            id: data.callerId,
            username: data.callerUsername,
            displayName: callerMetadata.displayName,
            letter: callerMetadata.letter,
            avatarClass: callerMetadata.avatarClass
          },
          status: 'incoming',
          type: data.type,
          isReceiver: true
        });
      });

      conn.on("IncomingGroupCall", (data) => {
        const isUnavailable = ['busy', 'away', 'donotdisturb', 'dnd', 'offline'].includes(presenceStatusRef.current?.toLowerCase());
        if (isUnavailable) {
          console.log(`[App] Auto-rejecting group call ${data.callId} because presence is ${presenceStatusRef.current}`);
          conn.invoke("RejectCall", data.callId, "Busy").catch(e => console.warn(e));
          return;
        }

        // Trigger native notification
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          const callerName = data.callerUsername || "Organizer";
          new Notification("Meeting Started", {
            body: `${callerName} has started meeting and you can join`,
            icon: '/favicon.ico'
          });
        }

        setActiveCall({
          id: data.callId,
          user: { id: data.callerId, displayName: data.callerUsername || 'Group Call' },
          status: 'incoming',
          type: 'group',
          conversationId: data.conversationId,
          isReceiver: true
        });
      });

      conn.on("CallWaiting", (data) => {
        const callerMetadata = usersCacheRef.current[data.callerId] || { displayName: data.callerUsername };
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          new Notification("Call Waiting", {
            body: `Incoming Call Waiting from: ${callerMetadata.displayName}`,
            icon: '/favicon.ico'
          });
        }
        showToast(`Incoming Call Waiting from: ${callerMetadata.displayName}`, 'info');
      });

      conn.on("ExecuteDeviceTransfer", (data) => {
        console.log("Call transferred to this device: ", data);
      });

      conn.on("OutgoingCallStarted", (data) => {
        setActiveCall(prev => {
          if (prev && prev.user?.id && data.targetUserId && prev.user.id.toLowerCase() === data.targetUserId.toLowerCase()) {
            return {
              ...prev,
              id: data.callId,
              status: 'ringing',
              isWaiting: data.isWaiting
            };
          }
          return prev;
        });
      });

      conn.on("OutgoingGroupCallStarted", (data) => {
        setActiveCall(prev => {
          if (prev) {
            return {
              ...prev,
              id: data.callId,
              status: 'ringing'
            };
          }
          return prev;
        });
      });

      conn.on("CallAccepted", (data) => {
        setActiveCall(prev => {
          if (!prev) return prev;
          let updated = { ...prev };
          // Caller received acceptance from callee
          if (prev.id && data.callId && prev.id.toLowerCase() === data.callId.toLowerCase()) {
            updated = { ...prev, status: 'connected', isReceiver: false };
          }
          // Joiner received their own CallAccepted back (JoinMeetingById response)
          else if (!prev.id && data.accepterId) {
            updated = { 
              ...prev, 
              id: data.callId, 
              status: 'connected', 
              isReceiver: prev.isInstantStart ? false : true,
              joinCode: data.joinCode 
            };
          }

          if (updated.meetingId && updated.isOrganizer && data.joinCode) {
            setTimeout(() => {
              broadcastMeetingStarted(updated.meetingId, data.joinCode, updated.user?.displayName || "Meeting");
            }, 0);
          }

          return updated;
        });
      });

      conn.on("CallRejected", (data) => {
        setActiveCall(prev => {
          if (prev && prev.id && data.callId && prev.id.toLowerCase() === data.callId.toLowerCase()) {
            // If it is a 1-to-1 outgoing call, transition to 'rejected' status so CallOverlay can stay mounted for voicemail
            if (!prev.isReceiver && !prev.isGroup && prev.type !== 'group') {
              return { ...prev, status: 'rejected', reason: data.reason };
            }
            showToast("Call was rejected: " + data.reason, "error");
            return null;
          }
          return prev;
        });
      });

      conn.on("CallEnded", (data) => {
        setActiveCall(prev => {
          if (prev && prev.id && data.callId && prev.id.toLowerCase() === data.callId.toLowerCase()) {
            // Only transition to voicemail if the call was never connected (outgoing 1-to-1)
            if (prev.status === 'ringing' && !prev.isReceiver && !prev.isGroup && prev.type !== 'group') {
              return { ...prev, status: 'rejected', reason: 'Unanswered' };
            }
            return null;
          }
          return prev;
        });
      });

      conn.on("StopRinging", (data) => {
        setActiveCall(prev => {
          if (prev && prev.id && data.callId && prev.id.toLowerCase() === data.callId.toLowerCase()) {
            // If this device answered the call, stay in the call
            if (prev.answeredLocally || (conn.connectionId && data.answeredByDevice === conn.connectionId)) {
              return prev;
            }
            return null;
          }
          return prev;
        });
      });

      // A new participant joined a group/meeting call — existing peers should negotiate WebRTC
      conn.on("ParticipantJoinedGroupCall", (data) => {
        // CallManager handles offering WebRTC to the new participant
        // via UserJoinedCall (if user is already in the call, CallManager binds UserJoinedCall)
        // No state update needed here — CallManager._bindHubEvents handles UserJoinedCall
        console.log('[App] ParticipantJoinedGroupCall:', data);
      });

      conn.start()
        .then(() => {
          console.log("Connected to VoIP Call Hub via SignalR.");
          callHubConnectionRef.current = conn;
          setCallHubConnection(conn);
        })
        .catch(err => console.error("CallHub connection error", err));
    }

    return () => {
      if (callHubConnectionRef.current && !token) {
        callHubConnectionRef.current.stop();
        callHubConnectionRef.current = null;
        setCallHubConnection(null);
      }
    };
  }, [token, currentUser?.id]);

  const handleCreateChannel = async (channelName, desc, isPrivate) => {
    try {
      const res = await fetch(`${BASE_URL}/api/conversations`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          type: "Channel",
          name: channelName
        })
      });
      if (res.ok) {
        const newConv = await res.json();
        await fetchConversations();
        setActiveChatId(newConv.id);
        setShowChannelModal(false);
      } else {
        const err = await res.json();
        alert(`Failed to create channel: ${err.error || res.statusText}`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to create channel");
    }
  };

  const handleCreateDm = async (targetUserId) => {
    try {
      const res = await fetch(`${BASE_URL}/api/conversations`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          type: "DirectMessage",
          memberIds: [targetUserId]
        })
      });
      if (res.ok) {
        const newConv = await res.json();
        await fetchConversations();
        setActiveChatId(newConv.id);
        setShowDmModal(false);
      } else {
        const err = await res.json();
        alert(`Failed to start DM: ${err.error || res.statusText}`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to start DM");
    }
  };

  const handleCreateGroup = async (groupName, memberIds) => {
    try {
      const res = await fetch(`${BASE_URL}/api/conversations`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          type: "GroupChat",
          name: groupName,
          memberIds: memberIds
        })
      });
      if (res.ok) {
        const newConv = await res.json();
        await fetchConversations();
        setActiveChatId(newConv.id);
        setShowGroupModal(false);

        // If called from "Start Meeting", launch a video group call on this new conversation
        if (pendingCallAfterGroupCreate) {
          setPendingCallAfterGroupCreate(false);
          setActiveCall({
            conversationId: newConv.id,
            user: { displayName: groupName },
            isVideo: true,
            type: 'group'
          });
        } else {
          setActiveTab('chat');
        }
      } else {
        const err = await res.json();
        alert(`Failed to create group: ${err.error || res.statusText}`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to create group");
    }
  };

  const handleAddParticipant = async (userId) => {
    if (!activeChatId) return;
    try {
      const res = await fetch(`${BASE_URL}/api/conversations/${activeChatId}/members`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          userId: userId,
          role: "Employee"
        })
      });
      if (res.ok) {
        await fetchConversations();
        setShowAddParticipantModal(false);
      } else {
        const err = await res.json();
        alert(`Failed to add member: ${err.error || res.statusText}`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to add member");
    }
  };

  const handleArchiveConversation = async (chatId) => {
    try {
      const res = await fetch(`${BASE_URL}/api/conversations/${chatId}/archive`, {
        method: 'POST',
        headers: authHeaders
      });
      if (res.ok) {
        await fetchConversations();
        setActiveChatId(null);
      } else {
        const err = await res.json();
        alert(`Failed to archive conversation: ${err.error || res.statusText}`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to archive conversation");
    }
  };

  const handleDeleteConversation = async (chatId) => {
    try {
      const res = await fetch(`${BASE_URL}/api/conversations/${chatId}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      if (res.ok) {
        setConversations(prev => {
          const next = { ...prev };
          delete next[chatId];
          return next;
        });
        setActiveChatId(null);
      } else {
        const err = await res.json();
        alert(`Failed to delete conversation: ${err.error || res.statusText}`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to delete conversation");
    }
  };

  const handleUploadFile = async (file) => {
    if (!activeChatId) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('conversationId', activeChatId);

      const res = await fetch(`${BASE_URL}/api/messages/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (res.ok) {
        await fetchMessageHistory(activeChatId);
      } else {
        const err = await res.json();
        alert(`Failed to upload file: ${err.error || res.statusText}`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to upload file");
    }
  };

  const handleDownloadFile = async (attachmentId, fileName) => {
    try {
      const res = await fetch(`${BASE_URL}/api/messages/attachments/${attachmentId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        alert("Failed to download file.");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to download file.");
    }
  };

  const handleLoginSubmit = async (username, password) => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) throw new Error("Invalid credentials");
    return await res.json();
  };

  const handleLoginSuccess = (accessToken) => {
    localStorage.setItem('token', accessToken);
    setToken(accessToken);
  };

  const handlePasswordChangeSubmit = async (newPassword, tempToken) => {
    const res = await fetch(`${BASE_URL}/api/auth/first-login-change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tempToken}`
      },
      body: JSON.stringify({ newPassword })
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || err.Error || 'Password change failed. Please try again.');
    }
    
    return await res.json();
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setCurrentUser(null);
    setConversations({});
    setActiveChatId(null);
    joinedGroupsRef.current.clear();
    if (connectionRef.current) {
      connectionRef.current.stop();
      connectionRef.current = null;
    }
    if (callHubConnectionRef.current) {
      callHubConnectionRef.current.stop();
      callHubConnectionRef.current = null;
      setCallHubConnection(null);
    }
  };

  const handleSendMessage = async (text) => {
    if (!activeChatId) return;
    try {
      if (editMessageId) {
        // Edit flow
        const res = await fetch(`${BASE_URL}/api/messages/${editMessageId}`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ content: text })
        });
        if (!res.ok) {
          const err = await res.json();
          alert(`Failed to edit message: ${err.error || res.statusText}`);
        }
        setEditMessageId(null);
      } else {
        // Send flow
        await fetch(`${BASE_URL}/api/messages`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ conversationId: activeChatId, content: text, type: "Text", parentMessageId: replyMessageId })
        });
        setReplyMessageId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteMessage = async (msgId, deleteType) => {
    try {
      const res = await fetch(`${BASE_URL}/api/messages/${msgId}?deleteType=${deleteType}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Failed to delete message: ${err.error || res.statusText}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleReactToMessage = async (msgId, emoji) => {
    if (!activeChat) return;
    const msg = activeChat.messages?.find(m => m.id === msgId);
    if (!msg) return;

    const hasReacted = msg.reactions?.[emoji]?.includes(currentUser?.id);
    const method = hasReacted ? 'DELETE' : 'POST';

    try {
      const res = await fetch(`${BASE_URL}/api/messages/${msgId}/react`, {
        method,
        headers: authHeaders,
        body: JSON.stringify({ emoji })
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Failed to update reaction: ${err.error || res.statusText}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!token) {
    return <LoginOverlay onLoginSubmit={handleLoginSubmit} onLoginSuccess={handleLoginSuccess} onPasswordChangeSubmit={handlePasswordChangeSubmit} />;
  }

  const activeChat = conversations[activeChatId] || null;

  return (
    <div id="workspace-wrapper" className="workspace-desktop" style={{ flexDirection: 'column' }}>
      {/* Top Navigation Bar */}
      <div className="teams-top-nav">
        <div className="nav-brand">
          <i className="fa-brands fa-microsoft nav-brand-icon"></i>
          SecureComm
        </div>
        
        <div className="nav-search nav-search-clickable">
          <i className="fa-solid fa-magnifying-glass search-icon" style={{marginRight: '8px'}}></i>
          <span>Search...</span>
        </div>
        
        <div className="nav-actions" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="nav-user-avatar avatar avatar-purple" onClick={() => setShowSettingsModal(true)} style={{cursor: 'pointer'}} title="Profile">
             {currentUser ? ((currentUser.displayName || currentUser.username || 'U').charAt(0).toUpperCase()) : 'U'}
          </div>
          <button 
            className="btn btn-sm" 
            style={{ backgroundColor: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '4px 12px', fontSize: '12px' }}
            onClick={() => {
              localStorage.removeItem('token');
              setToken(null);
              setCurrentUser(null);
            }}
          >
            <i className="fa-solid fa-arrow-right-from-bracket" style={{marginRight: '6px'}}></i> Logout
          </button>
        </div>
      </div>

      <div className="teams-body-wrapper">
        {/* Activity Bar / Nav Strip */}
        <div className="activity-bar" style={{ width: '68px', gap: '8px', padding: '16px 0' }}>
          <div className={`activity-item ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')} style={{ width: '48px', height: '48px' }}>
            <i className="fa-regular fa-bell" style={{ fontSize: '1.2rem' }}></i>
            <span style={{ fontSize: '0.75rem' }}>Activity</span>
          </div>
          <div className={`activity-item ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')} style={{ width: '48px', height: '48px' }}>
            <i className="fa-regular fa-message" style={{ fontSize: '1.2rem' }}></i>
            <span style={{ fontSize: '0.75rem' }}>Chat</span>
          </div>
          <div className={`activity-item ${activeTab === 'teams' ? 'active' : ''}`} onClick={() => setActiveTab('teams')} style={{ width: '48px', height: '48px' }}>
            <i className="fa-solid fa-people-group" style={{ fontSize: '1.2rem' }}></i>
            <span style={{ fontSize: '0.75rem' }}>Teams</span>
          </div>
          <div className={`activity-item ${activeTab === 'calls' ? 'active' : ''}`} onClick={() => setActiveTab('calls')} style={{ width: '48px', height: '48px' }}>
            <i className="fa-solid fa-phone" style={{ fontSize: '1.2rem' }}></i>
            <span style={{ fontSize: '0.75rem' }}>Calls</span>
          </div>
          <div className={`activity-item ${activeTab === 'meetings' ? 'active' : ''}`} onClick={() => setActiveTab('meetings')} style={{ width: '48px', height: '48px' }}>
            <i className="fa-solid fa-video" style={{ fontSize: '1.2rem' }}></i>
            <span style={{ fontSize: '0.75rem' }}>Meetings</span>
          </div>
          <div className={`activity-item ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')} style={{ width: '48px', height: '48px' }}>
            <i className="fa-regular fa-calendar" style={{ fontSize: '1.2rem' }}></i>
            <span style={{ fontSize: '0.75rem' }}>Calendar</span>
          </div>
          <div className={`activity-item ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')} style={{ width: '48px', height: '48px' }}>
            <i className="fa-regular fa-file" style={{ fontSize: '1.2rem' }}></i>
            <span style={{ fontSize: '0.75rem' }}>Files</span>
          </div>
          <div className={`activity-item ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')} style={{ width: '48px', height: '48px' }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '1.2rem' }}></i>
            <span style={{ fontSize: '0.75rem' }}>Alerts</span>
          </div>
          {(currentUser?.role === 'Administrator' || currentUser?.role === 'Super Administrator') && (
            <div className={`activity-item ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')} style={{ width: '48px', height: '48px', marginTop: 'auto', color: 'var(--accent-red)' }}>
              <i className="fa-solid fa-shield-halved" style={{ fontSize: '1.2rem' }}></i>
              <span style={{ fontSize: '0.75rem' }}>Admin</span>
            </div>
          )}
          <div className={`activity-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')} style={{ width: '48px', height: '48px', marginTop: (currentUser?.role === 'Administrator' || currentUser?.role === 'Super Administrator') ? '0' : 'auto' }}>
            <i className="fa-solid fa-gear" style={{ fontSize: '1.2rem' }}></i>
            <span style={{ fontSize: '0.75rem' }}>Settings</span>
          </div>
        </div>

        {activeTab !== 'settings' && activeTab !== 'meetings' && activeTab !== 'notifications' && activeTab !== 'activity' && activeTab !== 'files' && (
          <div className="list-panel">
            <Sidebar 
              currentUser={currentUser}
              conversations={conversations}
              activeChatId={activeChatId}
              setActiveChatId={setActiveChatId}
              usersCache={usersCache}
              presenceStatus={presenceStatus}
              onPresenceChange={setPresenceStatus}
              filterKeyword={filterKeyword}
              setFilterKeyword={setFilterKeyword}
              mobileSidebarActive={mobileSidebarActive}
              setMobileSidebarActive={setMobileSidebarActive}
              onLogout={handleLogout}
              onAddChannel={() => setShowChannelModal(true)}
              onAddDm={() => setShowDmModal(true)}
              onAddGroup={() => setShowGroupModal(true)}
              activeTab={activeTab}
              favoriteConvIds={favoriteConvIds}
              onToggleFavorite={(id) => setFavoriteConvIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
              callSubTab={callSubTab}
              setCallSubTab={setCallSubTab}
              onOpenProfileDrawer={() => setShowSettingsModal(true)}
              onStartDirectMessage={handleCreateDm}
            />
          </div>
        )}

        <div className="main-stage">
          {activeTab === 'chat' && (
            <ChatViewport 
              currentUser={currentUser}
              activeChat={activeChat}
              usersCache={usersCache}
              typingState={{}}
              onSendMessage={handleSendMessage}
              sendTypingIndicator={() => {}}
              onUploadFile={handleUploadFile}
              onDownloadFile={handleDownloadFile}
              onArchive={() => handleArchiveConversation(activeChatId)}
              onDeleteConversation={handleDeleteConversation}
              toggleDetails={() => setShowDetails(!showDetails)}
              replyMessageId={replyMessageId}
              setReplyMessageId={setReplyMessageId}
              editMessageId={editMessageId}
              setEditMessageId={setEditMessageId}
              onShowContextMenu={(messageId, x, y) => setContextMenu({ visible: true, x, y, messageId })}
              onStartCall={(targetUser, isVideo) => setActiveCall({ user: targetUser, isVideo })}
              onStartGroupCall={(convId, callName) => setActiveCall({ conversationId: convId, user: { displayName: callName }, isVideo: false, type: 'group' })}
              token={token}
            />
          )}
          
          {activeTab === 'activity' && (
            <ActivitySection 
              conversations={conversations} 
              currentUser={currentUser} 
              usersCache={usersCache}
              setActiveChatId={setActiveChatId}
              setActiveTab={setActiveTab}
            />
          )}

          {activeTab === 'teams' && (
            <TeamsSection 
               currentUser={currentUser}
               conversations={conversations}
               usersCache={usersCache}
               activeChatId={activeChatId}
               setActiveChatId={(id) => { setActiveChatId(id); setActiveTab('chat'); }}
               setActiveTab={setActiveTab}
               onSendMessage={handleSendMessage}
               onStartConference={(data) => setActiveCall({ conversationId: data.conversationId || data.id, user: { displayName: data.displayName }, isVideo: true, type: 'group' })}
               onUploadFile={handleUploadFile}
               token={token}
               onRefresh={initializeDashboard}
               onAddChannel={() => setShowChannelModal(true)}
            />
          )}
          
          {activeTab === 'calls' && (
            <CallsSection 
              usersCache={usersCache}
              currentUser={currentUser}
              onStartCall={(targetUser, isVideo) => setActiveCall({ user: targetUser, isVideo })}
              token={token}
              activeSubTab={callSubTab}
              conversations={conversations}
            />
          )}

          {activeTab === 'meetings' && (
            <MeetingsSection 
              onStartConference={() => {
                setActiveCall({
                  isVideo: true,
                  type: 'group',
                  isInstantStart: true
                });
              }}
              onJoinMeeting={(code) => setActiveCall({ 
                user: { displayName: `Meeting: ${code}` }, 
                isVideo: true, 
                type: 'group', 
                joinCode: code 
              })}
            />
          )}


          {activeTab === 'files' && (
             <FilesVault token={token} usersCache={usersCache} conversations={conversations} currentUser={currentUser} />
          )}

          {activeTab === 'calendar' && (
             <CalendarView 
               currentUser={currentUser} 
               usersCache={usersCache}
               onStartConference={(data) => setActiveCall({
                 conversationId: data.conversationId || data.id,
                 user: { displayName: data.displayName },
                 isVideo: data.isVideo !== undefined ? data.isVideo : true,
                 type: 'group',
                 meetingId: data.meetingId,
                 isOrganizer: data.isOrganizer,
                 invitees: data.invitees,
                 joinCode: data.joinCode
               })}
               conversations={conversations}
               token={token}
               BASE_URL={BASE_URL}
               onRefreshConversations={initializeDashboard}
               activeCall={activeCall}
               showToast={showToast}
             />
          )}

          {activeTab === 'notifications' && (
            <NotificationsSection 
              conversations={conversations}
              currentUser={currentUser}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsSection 
              currentUser={currentUser}
              token={token}
              onRefreshUser={initializeDashboard}
              showToast={showToast}
            />
          )}

          {activeTab === 'admin' && (
            <AdminPanel token={token} currentUser={currentUser} />
          )}
          
          {activeTab === 'chat' && showDetails && activeChat && (
            <ChatDetails 
              activeChat={activeChat}
              currentUser={currentUser}
              usersCache={usersCache}
              onClose={() => setShowDetails(false)}
              onAddParticipant={() => setShowAddParticipantModal(true)}
              onRemoveParticipant={() => {}}
              onLeaveConversation={() => {}}
            />
          )}
        </div>
      </div>

      {showChannelModal && (
        <CreateChannelModal 
          isOpen={true} 
          onClose={() => setShowChannelModal(false)} 
          onCreate={handleCreateChannel} 
          existingTeams={Array.from(new Set(Object.values(conversations || {}).filter(c => c && c.type === 'channel').map(c => {
            const clean = (c.name || '').replace(/^#\s*/, '');
            const match = clean.match(/^\[(.*?)\]\s*(.*)$/);
            return match ? match[1] : null;
          }).filter(Boolean)))} 
        />
      )}
      {showDmModal && (
        <CreateDmModal 
          isOpen={true} 
          onClose={() => setShowDmModal(false)} 
          onCreate={handleCreateDm} 
          usersCache={usersCache} 
          currentUser={currentUser}
        />
      )}
      {showGroupModal && (
        <CreateGroupModal 
          isOpen={true} 
          onClose={() => setShowGroupModal(false)} 
          onCreate={handleCreateGroup} 
          usersCache={usersCache} 
          currentUser={currentUser}
        />
      )}
      {showAddParticipantModal && (
        <AddParticipantModal 
          isOpen={true} 
          onClose={() => setShowAddParticipantModal(false)} 
          onAddMember={handleAddParticipant} 
          usersCache={usersCache} 
          currentUser={currentUser}
        />
      )}

      {showSettingsModal && (
        <SettingsModal 
          currentUser={currentUser}
          token={token}
          onClose={() => setShowSettingsModal(false)}
          onRefreshUser={initializeDashboard}
        />
      )}

      <MessageContextMenu 
        menuState={contextMenu}
        onClose={() => setContextMenu({ visible: false, x: 0, y: 0, messageId: null })}
        activeChat={activeChat}
        currentUser={currentUser}
        usersCache={usersCache}
        onReply={(msgId) => setReplyMessageId(msgId)}
        onEdit={(msgId) => setEditMessageId(msgId)}
        onDelete={handleDeleteMessage}
        onReact={handleReactToMessage}
      />

      {activeCall && activeCall.type === 'group' && (
        <ConferenceRoom
          activeCall={activeCall}
          currentUser={currentUser}
          onHangUp={() => setActiveCall(null)}
          token={token}
          callHubConnection={callHubConnection}
          onMinimize={() => {}}
          conversations={conversations}
          usersCache={usersCache}
          onSendMessage={handleSendMessage}
        />
      )}

      {activeCall && activeCall.type !== 'group' && (
        <CallOverlay 
          activeCall={activeCall}
          currentUser={currentUser}
          onHangUp={() => setActiveCall(null)}
          token={token}
          callHubConnection={callHubConnection}
          setActiveCall={setActiveCall}
          usersCache={usersCache}
          conversations={conversations}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 12000,
          backgroundColor: toast.type === 'error' ? '#ef4444' : toast.type === 'success' ? '#10b981' : '#3b82f6',
          color: '#fff', padding: '12px 20px', borderRadius: '8px', fontWeight: '600',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <i className={toast.type === 'error' ? 'fa-solid fa-circle-exclamation' : toast.type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-info'}></i>
          <span>{toast.message}</span>
        </div>
      )}

      {upcomingMeetingPrompt && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 11000,
          backgroundColor: '#1f1f23', border: '1px solid var(--border-color)',
          borderRadius: '12px', padding: '16px', color: '#fff', width: '320px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)'
        }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', fontWeight: 'bold' }}>Upcoming Meeting</h4>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            "{upcomingMeetingPrompt.title}" starts soon ({upcomingMeetingPrompt.time}). Would you like to join now?
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '6px 12px', fontSize: '0.8rem', minHeight: 'auto' }}
              onClick={() => setUpcomingMeetingPrompt(null)}
            >
              Dismiss
            </button>
            <button 
              className="btn btn-primary" 
              style={{ padding: '6px 12px', fontSize: '0.8rem', minHeight: 'auto' }}
              onClick={() => {
                setActiveCall({
                  conversationId: upcomingMeetingPrompt.conversationId || upcomingMeetingPrompt.id,
                  user: { displayName: upcomingMeetingPrompt.title },
                  isVideo: upcomingMeetingPrompt.type === 'Video',
                  type: 'group',
                  meetingId: upcomingMeetingPrompt.id,
                  isOrganizer: true
                });
                setUpcomingMeetingPrompt(null);
              }}
            >
              Join Call
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
