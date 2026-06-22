import { useState } from 'react';

export default function ActivitySection({ conversations, currentUser, usersCache, setActiveChatId, setActiveTab }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'mentions' | 'calls' | 'system'

  // Build activity feed dynamically
  const activities = [];

  // Parse conversations for DMs, Groups, and channels creation/messages
  Object.values(conversations || {}).forEach(conv => {
    if (!conv) return;

    // Creation event
    activities.push({
      id: `create-${conv.id}`,
      type: 'system',
      title: `New workspace active`,
      description: `You joined "${conv.name || 'Direct Message'}"`,
      time: new Date(conv.createdDate || Date.now()),
      icon: conv.type === 'channel' ? 'fa-hashtag' : 'fa-user-group',
      convId: conv.id
    });

    // Message events
    (conv.messages || []).forEach(msg => {
      if (!msg) return;

      const sender = usersCache[msg.senderId] || { displayName: msg.senderDisplayName || 'User' };
      const isMention = msg.content?.includes(`@${currentUser?.username}`);
      const isSelf = msg.senderId === currentUser?.id;

      if (isMention && !isSelf) {
        activities.push({
          id: `mention-${msg.id}`,
          type: 'mention',
          title: `Mentioned by ${sender.displayName || sender.username}`,
          description: msg.content,
          time: new Date(msg.createdDate || Date.now()),
          icon: 'fa-at',
          convId: conv.id
        });
      }

      if (msg.type === 'Attachment') {
        activities.push({
          id: `file-${msg.id}`,
          type: 'system',
          title: `${sender.displayName || sender.username} shared a file`,
          description: msg.content,
          time: new Date(msg.createdDate || Date.now()),
          icon: 'fa-file-lines',
          convId: conv.id
        });
      }
    });
  });

  // Sort by time descending
  activities.sort((a, b) => b.time - a.time);

  // Filter activities
  const filteredActivities = activities.filter(act => {
    if (filter === 'all') return true;
    if (filter === 'mentions') return act.type === 'mention';
    if (filter === 'calls') return act.type === 'call';
    if (filter === 'system') return act.type === 'system';
    return true;
  });

  const getIconColor = (type) => {
    switch (type) {
      case 'mention': return '#ef4444';
      case 'call': return '#3b82f6';
      case 'system': return '#10b981';
      default: return 'var(--primary)';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Activity Feed</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>Stay updated with mentions, group events, and messages.</p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-sidebar)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          {['all', 'mentions', 'calls', 'system'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? 'var(--bg-surface)' : 'transparent',
                color: filter === f ? 'var(--text-primary)' : 'var(--text-muted)',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                textTransform: 'capitalize',
                transition: 'all 0.15s ease'
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredActivities.map(act => (
          <div
            key={act.id}
            onClick={() => {
              if (act.convId) {
                setActiveChatId(act.convId);
                setActiveTab('chat');
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '16px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'transform 0.15s ease, background 0.15s ease'
            }}
            onMouseOver={e => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.background = 'var(--bg-card)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.background = 'var(--bg-surface)';
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
              <i className={`fa-solid ${act.icon}`} style={{ color: getIconColor(act.type), fontSize: '1.1rem' }}></i>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{act.title}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{act.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {act.description}
              </p>
            </div>
          </div>
        ))}

        {filteredActivities.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '3rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              <i className="fa-regular fa-bell-slash"></i>
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>All quiet for now</h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>We'll notify you when someone mentions you or sends updates.</p>
          </div>
        )}
      </div>
    </div>
  );
}
