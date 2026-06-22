import { useState, useEffect } from 'react';

export default function CalendarView({ currentUser, usersCache, onStartConference, conversations, token, BASE_URL, onRefreshConversations, activeCall, showToast }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [meetings, setMeetings] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState('');
  
  // Form state
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingTime, setMeetingTime] = useState('10:00');
  const [meetingDuration, setMeetingDuration] = useState('30');
  const [meetingType, setMeetingType] = useState('Video'); // 'Video' | 'Audio'
  const [meetingDesc, setMeetingDesc] = useState('');
  const [selectedInvitees, setSelectedInvitees] = useState([]);

  useEffect(() => {
    // 1. Load local meetings
    const savedMeetings = localStorage.getItem(`meetings_${currentUser?.id}`);
    let localList = savedMeetings ? JSON.parse(savedMeetings) : [];

    // 2. Scan all messages in conversations for scheduled and cancelled meetings
    const messageMeetings = [];
    const cancelledMeetingIds = new Set();
    const startedMeetingCodes = {}; // meetingId -> joinCode
    if (conversations) {
      Object.values(conversations).forEach(conv => {
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

    // Combine local and message-based meetings without duplicates, filtering out cancelled ones
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

    setMeetings(combined);
  }, [currentUser, conversations]);

  const saveMeetings = (updatedMeetings) => {
    setMeetings(updatedMeetings);
    localStorage.setItem(`meetings_${currentUser?.id}`, JSON.stringify(updatedMeetings));
  };

  const formatDateKey = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleCellClick = (dateStr) => {
    setSelectedDateStr(dateStr);
    setShowCreateModal(true);
  };

  const handleCreateMeeting = async (e) => {
    e.preventDefault();
    if (!meetingTitle.trim()) return;

    const meetingId = `meet-${Date.now()}`;
    const newMeeting = {
      id: meetingId,
      title: meetingTitle,
      date: selectedDateStr,
      time: meetingTime,
      duration: meetingDuration,
      type: meetingType,
      description: meetingDesc,
      invitees: selectedInvitees,
      organizerId: currentUser?.id
    };

    // Save locally
    const updated = [...meetings, newMeeting];
    saveMeetings(updated);

    // Send invitations to invitees via conversation messages
    if (selectedInvitees.length > 0 && token && conversations) {
      for (const inviteeId of selectedInvitees) {
        try {
          // Find existing DM with this user
          let existingDm = Object.values(conversations).find(c => 
            c && c.type === 'dm' && 
            c.memberDetails && c.memberDetails.some(m => m.userId.toLowerCase() === inviteeId.toLowerCase())
          );

          let conversationId = existingDm?.id;

          if (!conversationId) {
            // Create a DM conversation
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
            // Send the meeting scheduled message
            await fetch(`${BASE_URL}/api/messages`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                conversationId: conversationId,
                content: `[MEETING_SCHEDULED]:${JSON.stringify(newMeeting)}`,
                type: "System"
              })
            });
          }
        } catch (err) {
          console.error("Failed to send meeting invite to user", inviteeId, err);
        }
      }
      
      if (onRefreshConversations) {
        onRefreshConversations();
      }
    }

    // Reset form
    setMeetingTitle('');
    setMeetingTime('10:00');
    setMeetingDuration('30');
    setMeetingType('Video');
    setMeetingDesc('');
    setSelectedInvitees([]);
    setShowCreateModal(false);
  };

  const handleDeleteMeeting = async (meeting) => {
    if (confirm(`Are you sure you want to cancel the meeting "${meeting.title}"?`)) {
      // 1. Delete from local storage
      const updated = meetings.filter(m => m.id !== meeting.id);
      saveMeetings(updated);

      // 2. Send cancellation message to invitees' conversations
      if (meeting.invitees && meeting.invitees.length > 0 && token && conversations) {
        for (const inviteeId of meeting.invitees) {
          try {
            // Find existing DM with this user
            let existingDm = Object.values(conversations).find(c => 
              c && c.type === 'dm' && 
              c.memberDetails && c.memberDetails.some(m => m.userId.toLowerCase() === inviteeId.toLowerCase())
            );

            let conversationId = existingDm?.id;

            if (conversationId) {
              await fetch(`${BASE_URL}/api/messages`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  conversationId: conversationId,
                  content: `[MEETING_CANCELLED]:${JSON.stringify({ id: meeting.id, title: meeting.title })}`,
                  type: "System"
                })
              });
            }
          } catch (err) {
            console.error("Failed to send meeting cancellation to user", inviteeId, err);
          }
        }
        
        if (onRefreshConversations) {
          onRefreshConversations();
        }
      }
    }
  };

  const handleJoinMeeting = (meeting) => {
    // 1. Enforce organizer starting restriction with case-insensitive check
    const isOrganizer = meeting.organizerId && currentUser?.id && 
      meeting.organizerId.toLowerCase() === currentUser.id.toLowerCase();
      
    const isActiveCallForMeeting = activeCall && activeCall.id && 
      ((activeCall.conversationId && meeting.conversationId && activeCall.conversationId.toLowerCase() === meeting.conversationId.toLowerCase()) || 
       (activeCall.conversationId && meeting.id && activeCall.conversationId.toLowerCase() === meeting.id.toLowerCase()));

    const isStarted = meeting.joinCode || isActiveCallForMeeting || isOrganizer;

    if (!isStarted) {
      showToast("The meeting organizer has not started this meeting yet. Please wait for the host to start the call.", "error");
      return;
    }

    // Starts a conference call using the meeting ID as the room name
    onStartConference({
      id: meeting.id,
      conversationId: meeting.conversationId,
      displayName: meeting.title,
      isVideo: meeting.type === 'Video',
      isGroup: true,
      meetingId: meeting.id,
      isOrganizer: isOrganizer,
      invitees: meeting.invitees || [],
      joinCode: meeting.joinCode
    });
  };

  // Grid dates calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const prevLastDay = new Date(year, month, 0).getDate();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const gridCells = [];

  // Previous month padding days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const d = prevLastDay - i;
    const prevDate = new Date(year, month - 1, d);
    gridCells.push({
      num: d,
      currentMonth: false,
      dateStr: formatDateKey(prevDate)
    });
  }

  // Current month days
  for (let d = 1; d <= lastDay; d++) {
    const curDate = new Date(year, month, d);
    gridCells.push({
      num: d,
      currentMonth: true,
      dateStr: formatDateKey(curDate)
    });
  }

  // Next month padding days
  const remainingCells = 42 - gridCells.length; // 6 rows of 7 days
  for (let d = 1; d <= remainingCells; d++) {
    const nextDate = new Date(year, month + 1, d);
    gridCells.push({
      num: d,
      currentMonth: false,
      dateStr: formatDateKey(nextDate)
    });
  }

  // Group meetings by date for grid rendering
  const meetingsByDate = {};
  meetings.forEach(m => {
    if (!meetingsByDate[m.date]) {
      meetingsByDate[m.date] = [];
    }
    meetingsByDate[m.date].push(m);
  });

  return (
    <div className="calendar-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-main)', color: '#fff', padding: '24px', overflowY: 'auto' }}>
      
      {/* Calendar Header */}
      <div className="calendar-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '700', margin: 0 }}>
            {monthNames[month]} {year}
          </h2>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={prevMonth} className="btn btn-secondary" style={{ padding: '6px 12px', minWidth: 'auto' }}>
              <i className="fa-solid fa-chevron-left"></i>
            </button>
            <button onClick={() => setCurrentDate(new Date())} className="btn btn-secondary" style={{ padding: '6px 12px', minWidth: 'auto', fontSize: '0.8rem' }}>
              Today
            </button>
            <button onClick={nextMonth} className="btn btn-secondary" style={{ padding: '6px 12px', minWidth: 'auto' }}>
              <i className="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        </div>

        <button onClick={() => handleCellClick(formatDateKey(new Date()))} className="btn btn-primary">
          <i className="fa-solid fa-calendar-plus" style={{ marginRight: '6px' }}></i> New Meeting
        </button>
      </div>

      <div style={{ display: 'flex', gap: '24px', flex: 1 }}>
        {/* Main Grid View */}
        <div style={{ flex: 3, display: 'flex', flexDirection: 'column' }}>
          <div className="calendar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', backgroundColor: 'rgba(0, 0, 0, 0.15)' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="calendar-day-header" style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '0.8rem', color: 'var(--text-secondary)', paddingBottom: '8px' }}>
                {d}
              </div>
            ))}

            {gridCells.map((cell, idx) => {
              const dayMeetings = meetingsByDate[cell.dateStr] || [];
              const isToday = cell.dateStr === formatDateKey(new Date());

              return (
                <div 
                  key={idx} 
                  className="calendar-cell"
                  onDoubleClick={() => handleCellClick(cell.dateStr)}
                  style={{
                    minHeight: '100px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '6px',
                    backgroundColor: isToday ? 'rgba(98, 100, 167, 0.1)' : cell.currentMonth ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.05)',
                    borderColor: isToday ? 'var(--primary)' : 'var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isToday ? 'rgba(98, 100, 167, 0.1)' : cell.currentMonth ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.05)'; }}
                >
                  <span 
                    className="calendar-cell-num" 
                    style={{ 
                      fontSize: '0.75rem', 
                      fontWeight: 'bold', 
                      color: cell.currentMonth ? 'var(--text-primary)' : 'var(--text-muted)',
                      alignSelf: 'flex-start',
                      marginBottom: '4px'
                    }}
                  >
                    {cell.num}
                  </span>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, overflowY: 'auto', maxHeight: '70px' }}>
                    {dayMeetings.map(meet => (
                      <div 
                        key={meet.id}
                        className={`calendar-event ${meet.type === 'Video' ? 'purple' : 'green'}`}
                        style={{
                          fontSize: '0.65rem',
                          padding: '2px 4px',
                          borderRadius: '4px',
                          color: '#fff',
                          background: meet.type === 'Video' ? 'rgba(98, 100, 167, 0.4)' : 'rgba(16, 185, 129, 0.4)',
                          borderLeft: meet.type === 'Video' ? '3px solid var(--primary)' : '3px solid var(--online)',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap'
                        }}
                        title={`${meet.title} (${meet.time})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDateStr(meet.date);
                          // We will just alert details or let user select it in the agenda sidebar
                        }}
                      >
                        {meet.time} {meet.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar Agenda List */}
        <div style={{ flex: 1.2, backgroundColor: 'var(--bg-sidebar)', borderRadius: '8px', border: '1px solid var(--border-color)', padding: '16px', display: 'flex', flexDirection: 'column', maxHeight: '680px', overflowY: 'auto' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 'bold', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-list-ul" style={{ color: 'var(--primary)' }}></i> Upcoming Agenda
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>
            {meetings
              .sort((a, b) => {
                const dateDiff = a.date.localeCompare(b.date);
                if (dateDiff !== 0) return dateDiff;
                return a.time.localeCompare(b.time);
              })
              .map(meet => {
                const meetDate = new Date(meet.date);
                const formattedDate = meetDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                return (
                  <div 
                    key={meet.id} 
                    style={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.03)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: '6px', 
                      padding: '12px', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '8px',
                      position: 'relative'
                    }}
                  >
                    <button 
                      onClick={() => handleDeleteMeeting(meet)}
                      style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', fontSize: '0.8rem' }}
                      title="Cancel Meeting"
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>

                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                      {formattedDate} @ {meet.time} ({meet.duration} min)
                    </div>

                    <div style={{ fontWeight: '600', fontSize: '0.9rem', color: '#fff', paddingRight: '20px' }}>
                      {meet.title}
                    </div>

                    {meet.description && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {meet.description}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                      <button 
                        onClick={() => handleJoinMeeting(meet)}
                        className="btn btn-primary"
                        style={{ flex: 1, padding: '4px 8px', fontSize: '0.75rem', minHeight: 'auto' }}
                      >
                        <i className="fa-solid fa-video" style={{ marginRight: '6px' }}></i> Join
                      </button>
                    </div>
                  </div>
                );
              })}

            {meetings.length === 0 && (
              <div style={{ padding: '40px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                No upcoming meetings scheduled.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Meeting Modal */}
      {showCreateModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <form onSubmit={handleCreateMeeting} className="modal-box" style={{ width: '100%', maxWidth: '480px', backgroundColor: '#1f1f23', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '24px', color: '#fff' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Schedule Teams Meeting</h3>
              <button type="button" onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              <div className="form-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>MEETING TITLE</label>
                <input 
                  type="text" 
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  placeholder="e.g. Code Review sync"
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #3f3f46', backgroundColor: '#121214', color: '#fff' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>DATE</label>
                  <input 
                    type="date" 
                    value={selectedDateStr}
                    onChange={(e) => setSelectedDateStr(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #3f3f46', backgroundColor: '#121214', color: '#fff' }}
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>START TIME</label>
                  <input 
                    type="time" 
                    value={meetingTime}
                    onChange={(e) => setMeetingTime(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #3f3f46', backgroundColor: '#121214', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>DURATION</label>
                  <select 
                    value={meetingDuration}
                    onChange={(e) => setMeetingDuration(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #3f3f46', backgroundColor: '#121214', color: '#fff' }}
                  >
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                    <option value="120">2 hours</option>
                  </select>
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>CONFERENCE TYPE</label>
                  <select 
                    value={meetingType}
                    onChange={(e) => setMeetingType(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #3f3f46', backgroundColor: '#121214', color: '#fff' }}
                  >
                    <option value="Video">Video Call</option>
                    <option value="Audio">Audio Call Only</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>DESCRIPTION</label>
                <textarea 
                  value={meetingDesc}
                  onChange={(e) => setMeetingDesc(e.target.value)}
                  placeholder="Agenda details..."
                  style={{ width: '100%', height: '60px', padding: '8px 12px', borderRadius: '4px', border: '1px solid #3f3f46', backgroundColor: '#121214', color: '#fff', resize: 'none' }}
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>INVITE TEAM MEMBERS</label>
                <div style={{ maxHeight: '100px', overflowY: 'auto', border: '1px solid #3f3f46', borderRadius: '4px', padding: '6px', backgroundColor: '#121214' }}>
                  {Object.values(usersCache)
                    .filter(u => u.id !== currentUser?.id)
                    .map(u => {
                      const isInvited = selectedInvitees.includes(u.id);
                      return (
                        <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={isInvited}
                            onChange={() => {
                              if (isInvited) {
                                setSelectedInvitees(selectedInvitees.filter(id => id !== u.id));
                              } else {
                                setSelectedInvitees([...selectedInvitees, u.id]);
                              }
                            }}
                          />
                          <span>{u.displayName} (@{u.username})</span>
                        </label>
                      );
                    })}
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
              <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Schedule
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
