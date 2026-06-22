import { useState, useEffect } from 'react';
import { BASE_URL } from '../config';

export default function ContactsSection({ usersCache, currentUser, onStartCall, token }) {
  const [favorites, setFavorites] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all' | 'online' | 'favorites' | 'blocked'
  const [search, setSearch] = useState('');

  // Compile full user list from cache
  const allUsers = Object.values(usersCache || {}).filter(
    (u, index, self) => u && u.id && self.findIndex(t => t.id === u.id) === index && u.id !== currentUser?.id
  );

  useEffect(() => {
    // Note: Favorites/Blocks are managed via call endpoints, we sync them here
    // In a real app we'd fetch them, let's mock or sync local state
  }, []);

  const handleToggleFavorite = async (userId) => {
    const isFav = favorites.includes(userId);
    try {
      const url = `${BASE_URL}/api/call/favorites`;
      const method = isFav ? 'DELETE' : 'POST';
      const endpoint = isFav ? `${url}/${userId}` : url;
      const body = isFav ? null : JSON.stringify({ targetUserId: userId });

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body
      });

      if (res.ok) {
        setFavorites(prev => isFav ? prev.filter(id => id !== userId) : [...prev, userId]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleBlock = async (userId) => {
    const isBlocked = blocks.includes(userId);
    try {
      const url = `${BASE_URL}/api/call/blocks`;
      const method = isBlocked ? 'DELETE' : 'POST';
      const endpoint = isBlocked ? `${url}/${userId}` : url;
      const body = isBlocked ? null : JSON.stringify({ targetUserId: userId });

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body
      });

      if (res.ok) {
        setBlocks(prev => isBlocked ? prev.filter(id => id !== userId) : [...prev, userId]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Filter & Search users
  const filteredUsers = allUsers.filter(u => {
    const matchesSearch = 
      (u.displayName || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.username || '').toLowerCase().includes(search.toLowerCase());
    
    if (!matchesSearch) return false;

    if (filter === 'online') return (u.status || '').toLowerCase() === 'online';
    if (filter === 'favorites') return favorites.includes(u.id);
    if (filter === 'blocked') return blocks.includes(u.id);
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px', overflowY: 'auto' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Company Directory</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>Search and initiate calls with members of your organization.</p>
        </div>

        {/* Filter buttons */}
        <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-sidebar)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          {[
            { id: 'all', label: 'All' },
            { id: 'online', label: 'Online' },
            { id: 'favorites', label: 'Favorites' },
            { id: 'blocked', label: 'Blocked' }
          ].map(btn => (
            <button
              key={btn.id}
              onClick={() => setFilter(btn.id)}
              style={{
                background: filter === btn.id ? 'var(--bg-surface)' : 'transparent',
                color: filter === btn.id ? 'var(--text-primary)' : 'var(--text-muted)',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                transition: 'all 0.15s'
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search Input */}
      <div style={{ position: 'relative', marginBottom: '24px' }}>
        <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}></i>
        <input 
          type="text" 
          placeholder="Search members by name, username, ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            padding: '12px 12px 12px 48px',
            borderRadius: '10px',
            color: '#fff',
            outline: 'none',
            fontSize: '0.95rem'
          }}
        />
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {filteredUsers.map(user => {
          const isFav = favorites.includes(user.id);
          const isBlocked = blocks.includes(user.id);
          const isUserOnline = (user.status || '').toLowerCase() === 'online';

          return (
            <div 
              key={user.id}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                position: 'relative'
              }}
            >
              {/* Profile info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ position: 'relative' }}>
                  <div className={`avatar text-avatar ${user.avatarClass || 'avatar-blue'}`} style={{ width: '48px', height: '48px', fontSize: '1.2rem' }}>
                    {(user.displayName || user.username || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div 
                    className={`status-badge ${(user.status || 'offline').toLowerCase()}`} 
                    style={{ position: 'absolute', bottom: '0', right: '0', border: '2px solid var(--bg-surface)' }}
                  ></div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '1.05rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.displayName || user.username}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>@{user.username}</div>
                </div>

                {/* Favorites button */}
                <button
                  onClick={() => handleToggleFavorite(user.id)}
                  style={{
                    marginLeft: 'auto',
                    background: 'none',
                    border: 'none',
                    color: isFav ? 'var(--accent-gold)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                    padding: '4px'
                  }}
                >
                  <i className={isFav ? "fa-solid fa-star" : "fa-regular fa-star"}></i>
                </button>
              </div>

              {/* Direct call action */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => onStartCall(user, false)}
                  disabled={isBlocked}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '8px',
                    background: 'var(--primary)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 'bold',
                    cursor: isBlocked ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <i className="fa-solid fa-phone"></i> Call
                </button>
                <button
                  onClick={() => onStartCall(user, true)}
                  disabled={isBlocked}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.05)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 'bold',
                    cursor: isBlocked ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <i className="fa-solid fa-video"></i> Video
                </button>
                <button
                  onClick={() => handleToggleBlock(user.id)}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    background: 'none',
                    border: '1px solid var(--border-color)',
                    color: isBlocked ? 'var(--secondary)' : 'var(--text-muted)',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                  title={isBlocked ? "Unblock user" : "Block user"}
                >
                  <i className="fa-solid fa-ban"></i>
                </button>
              </div>
            </div>
          );
        })}

        {filteredUsers.length === 0 && (
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '3rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              <i className="fa-solid fa-user-slash"></i>
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>No contacts found</h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Try modifying your filter or directory search.</p>
          </div>
        )}
      </div>

    </div>
  );
}
