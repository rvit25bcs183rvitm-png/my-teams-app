import { useState } from 'react';

export default function MeetingsSection({ onStartConference, onJoinMeeting }) {
  const [meetingId, setMeetingId] = useState('');
  const [scheduledMeetings, setScheduledMeetings] = useState([
    { id: '1', title: 'Daily Standup', host: 'System Administrator', time: '10:00 AM', joinCode: 'STANDUP' },
    { id: '2', title: 'Security Architecture Audit', host: 'Operations Lead', time: '2:30 PM', joinCode: 'SECURE_AUDIT' },
    { id: '3', title: 'Retrospective Sync', host: 'Product Manager', time: 'Tomorrow, 4:00 PM', joinCode: 'RETRO_SYNC' }
  ]);

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    if (meetingId.trim() && onJoinMeeting) {
      onJoinMeeting(meetingId.trim());
    }
  };

  const handleStartInstant = () => {
    if (onStartConference) {
      onStartConference();
    }
  };

  return (
    <div style={{ display: 'flex', gap: '32px', padding: '32px', height: '100%', overflowY: 'auto', flexWrap: 'wrap' }}>
      
      {/* Left Pane: Instant controls */}
      <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700, background: 'linear-gradient(135deg, #a5b4fc, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Secure Enterprise Meetings
          </h2>
          <p style={{ margin: '8px 0 0 0', color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.5 }}>
            Communicate securely using localized peer-to-peer and group conference rooms. Fully encrypted.
          </p>
        </div>

        {/* Start instant meeting */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--shadow-md)' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 600 }}>Instant Meeting</h3>
          <p style={{ margin: '0 0 20px 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Start a meeting right away and invite team members to join.</p>
          
          <button 
            onClick={handleStartInstant}
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', borderRadius: '10px', fontSize: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
          >
            <i className="fa-solid fa-video"></i> Start Meeting Now
          </button>
        </div>

        {/* Join meeting via ID */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--shadow-md)' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 600 }}>Join a Meeting</h3>
          <p style={{ margin: '0 0 20px 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Enter a meeting code or invitation ID to connect.</p>

          <form onSubmit={handleJoinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ position: 'relative' }}>
              <i className="fa-solid fa-key" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}></i>
              <input 
                type="text" 
                placeholder="Meeting Code / ID (e.g., STANDUP)"
                value={meetingId}
                onChange={e => setMeetingId(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-color)',
                  padding: '14px 14px 14px 40px',
                  borderRadius: '10px',
                  color: '#fff',
                  outline: 'none',
                  fontSize: '0.95rem'
                }}
              />
            </div>
            <button 
              type="submit"
              disabled={!meetingId.trim()}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '10px',
                fontSize: '1rem',
                fontWeight: 'bold',
                background: meetingId.trim() ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                color: meetingId.trim() ? '#fff' : 'rgba(255,255,255,0.2)',
                border: 'none',
                cursor: meetingId.trim() ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s'
              }}
            >
              Join Room
            </button>
          </form>
        </div>
      </div>

      {/* Right Pane: Upcoming meetings list */}
      <div style={{ flex: '1 1 350px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: 'var(--shadow-md)' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Upcoming Scheduled Meetings</h3>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Auto-synced calendar sessions.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {scheduledMeetings.map(mtg => (
            <div 
              key={mtg.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border-color)'
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mtg.title}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  <i className="fa-regular fa-clock" style={{ marginRight: '6px' }}></i> {mtg.time}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--primary)', marginTop: '4px', fontWeight: 500 }}>
                  Host: {mtg.host}
                </div>
              </div>

              <button 
                onClick={() => onJoinMeeting(mtg.joinCode)}
                className="btn btn-sm btn-secondary"
                style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Join
              </button>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
