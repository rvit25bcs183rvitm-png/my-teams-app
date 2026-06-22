import { useState } from 'react';

export default function NotificationsSection({ conversations, currentUser }) {
  const [notifications, setNotifications] = useState([
    { id: '1', title: 'Security Alert', body: 'New login detected from IP 192.168.1.45', time: '1 hour ago', read: false, icon: 'fa-shield-halved', color: '#f59e0b' },
    { id: '2', title: 'System Update', body: 'Platform upgraded to v2.4.0 successfully.', time: '2 hours ago', read: true, icon: 'fa-circle-info', color: '#10b981' }
  ]);

  const handleMarkAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleClearAll = () => {
    setNotifications([]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px', overflowY: 'auto' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Notifications</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>Review login alerts, security notifications, and platform tasks.</p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={handleMarkAllRead}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem'
            }}
          >
            Mark all read
          </button>
          <button 
            onClick={handleClearAll}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--secondary)',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem'
            }}
          >
            Clear all
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {notifications.map(notif => (
          <div
            key={notif.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '16px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              opacity: notif.read ? 0.7 : 1,
              transition: 'opacity 0.2s'
            }}
          >
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.02)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border-color)'
            }}>
              <i className={`fa-solid ${notif.icon}`} style={{ color: notif.color, fontSize: '1.1rem' }}></i>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fff' }}>{notif.title}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{notif.time}</span>
              </div>
              <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                {notif.body}
              </p>
            </div>

            {!notif.read && (
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)' }}></div>
            )}
          </div>
        ))}

        {notifications.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '3rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              <i className="fa-regular fa-bell-slash"></i>
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>No notifications</h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>You are completely caught up!</p>
          </div>
        )}
      </div>

    </div>
  );
}
