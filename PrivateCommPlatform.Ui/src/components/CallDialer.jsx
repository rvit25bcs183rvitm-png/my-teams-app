import React, { useState, useEffect } from 'react';
import { BASE_URL } from '../config';

export default function CallDialer({ usersCache, currentUser, onStartCall, token }) {
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState('');

  useEffect(() => {
    if (token) {
      fetchFavoritesAndBlocks();
    }
  }, [token]);

  const fetchFavoritesAndBlocks = async () => {
    try {
      const savedFavs = JSON.parse(localStorage.getItem(`favs_${currentUser?.id || ''}`) || "[]");
      const savedBlocks = JSON.parse(localStorage.getItem(`blocks_${currentUser?.id || ''}`) || "[]");
      setFavorites(savedFavs);
      setBlocks(savedBlocks);
    } catch {}
  };

  const toggleFavorite = async (targetUserId) => {
    let updated;
    if (favorites.includes(targetUserId)) {
      updated = favorites.filter(id => id !== targetUserId);
      await fetch(`${BASE_URL}/api/call/favorites/${targetUserId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
    } else {
      updated = [...favorites, targetUserId];
      await fetch(`${BASE_URL}/api/call/favorites`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId })
      });
    }
    setFavorites(updated);
    localStorage.setItem(`favs_${currentUser?.id || ''}`, JSON.stringify(updated));
  };

  const toggleBlock = async (targetUserId) => {
    let updated;
    if (blocks.includes(targetUserId)) {
      updated = blocks.filter(id => id !== targetUserId);
      await fetch(`${BASE_URL}/api/call/blocks/${targetUserId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
    } else {
      updated = [...blocks, targetUserId];
      await fetch(`${BASE_URL}/api/call/blocks`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId })
      });
    }
    setBlocks(updated);
    localStorage.setItem(`blocks_${currentUser?.id || ''}`, JSON.stringify(updated));
  };

  const eligibleUsers = Object.values(usersCache || {}).filter(
    (u) => u.id !== currentUser?.id
  );

  const filteredUsers = eligibleUsers.filter(u => 
    (u.displayName || '').toLowerCase().includes(searchKeyword.toLowerCase()) ||
    (u.username || '').toLowerCase().includes(searchKeyword.toLowerCase())
  );

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const aFav = favorites.includes(a.id) ? 1 : 0;
    const bFav = favorites.includes(b.id) ? 1 : 0;
    return bFav - aFav;
  });

  const handleStartCall = (isVideo) => {
    if (!selectedUserId) return;
    
    if (blocks.includes(selectedUserId)) {
      alert("You have blocked this contact. Unblock them first to call.");
      return;
    }
    
    const targetUser = usersCache[selectedUserId];
    onStartCall(targetUser, isVideo);
  };

  return (
    <div className="dialer-container">
      <div className="dialer-box">
        <h2 className="dialer-title">VoIP Ultra-Low Latency Calling</h2>
        <p className="dialer-subtitle">
          Real-time audio streams are routed directly peer-to-peer using WebRTC end-to-end encryption.
        </p>

        <input 
          type="text"
          placeholder="Search contacts..."
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          className="dialer-search"
        />

        <div className="dialer-contacts-list">
          {sortedUsers.map(u => (
            <div 
              key={u.id}
              className={`dialer-contact-item ${selectedUserId === u.id ? 'selected' : ''}`}
              onClick={() => setSelectedUserId(u.id)}
            >
              <div className="dialer-contact-info">
                <div className={`avatar text-avatar ${u.avatarClass || ''} dialer-avatar`}>
                  {u.letter || ''}
                </div>
                <div className="dialer-contact-details">
                  <span className="dialer-contact-name">
                    {u.displayName || ''}
                    {favorites.includes(u.id) && <i className="fa-solid fa-star dialer-star-icon"></i>}
                  </span>
                  <span className="dialer-contact-username">@{u.username || ''}</span>
                </div>
              </div>
              
              <div className="dialer-contact-actions" onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={() => toggleFavorite(u.id)}
                  className={`dialer-action-btn ${favorites.includes(u.id) ? 'fav-active' : ''}`}
                  title="Favorite"
                >
                  <i className="fa-solid fa-star"></i>
                </button>
                <button 
                  onClick={() => toggleBlock(u.id)}
                  className={`dialer-action-btn ${blocks.includes(u.id) ? 'block-active' : ''}`}
                  title={blocks.includes(u.id) ? "Unblock User" : "Block User"}
                >
                  <i className="fa-solid fa-ban"></i>
                </button>
              </div>
            </div>
          ))}
          {sortedUsers.length === 0 && (
            <div className="dialer-empty-state">
              No contacts found.
            </div>
          )}
        </div>

        <div className="dialer-actions">
          <button 
            className="dialer-btn dialer-btn-audio" 
            disabled={!selectedUserId}
            onClick={() => handleStartCall(false)}
          >
            <i className="fa-solid fa-phone"></i> Audio Call
          </button>
        </div>
      </div>
    </div>
  );
}

