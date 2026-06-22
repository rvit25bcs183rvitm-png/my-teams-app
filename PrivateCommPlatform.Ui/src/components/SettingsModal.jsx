import { useState, useEffect } from 'react';
import { BASE_URL } from '../config';

export default function SettingsModal({ currentUser, token, onClose, onRefreshUser }) {
  const [activeTab, setActiveTab] = useState('profile');

  // Profile Form
  const [username, setUsername] = useState(currentUser?.username || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Security Form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  
  // Sessions
  const [activeSessions, setActiveSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  useEffect(() => {
    if (activeTab === 'security') {
      fetchSessions();
    }
  }, [activeTab]);

  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const res = await fetch(`${BASE_URL}/api/sessions/active`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setActiveSessions(data);
      }
    } catch (e) {
      console.error("Failed to fetch sessions", e);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!username) return;
    
    setIsSavingProfile(true);
    try {
      const response = await fetch(`${BASE_URL}/api/users/${currentUser.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ 
          displayName: username, 
          email: currentUser?.email || '',
          firstName: currentUser?.firstName || '',
          lastName: currentUser?.lastName || ''
        })
      });
      
      if (response.ok) {
        alert("Profile updated successfully!");
        if (onRefreshUser) onRefreshUser();
      } else {
        const err = await response.json();
        alert(`Failed to update profile: ${err.error || response.statusText}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error updating profile.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!newPassword) return;

    setIsChangingPassword(true);
    try {
      // In a real app, you might need a dedicated change password endpoint for self-service
      // Using the reset password endpoint for now
      const response = await fetch(`${BASE_URL}/api/users/${currentUser.id}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword })
      });
      
      if (response.ok) {
        alert("Password updated successfully!");
        setCurrentPassword('');
        setNewPassword('');
      } else {
        const err = await response.json();
        alert(`Failed to reset password: ${err.error || response.statusText}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error resetting password.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    if (!confirm("Are you sure you want to sign out of all other devices?")) return;
    
    try {
      const response = await fetch(`${BASE_URL}/api/sessions/revoke-all`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        alert("All other sessions revoked.");
        fetchSessions();
      } else {
        alert("Failed to revoke sessions.");
      }
    } catch (e) {
      console.error(e);
      alert("Error revoking sessions.");
    }
  };



  return (
    <div className="modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="settings-modal" style={{
        background: 'var(--bg-surface)', width: '900px', height: '600px',
        borderRadius: '16px', display: 'flex', overflow: 'hidden',
        border: '1px solid var(--border-color)', boxShadow: '0 24px 48px rgba(0,0,0,0.2)'
      }}>
        
        {/* Sidebar Navigation */}
        <div className="settings-sidebar" style={{
          width: '250px', background: 'var(--bg-panel)', borderRight: '1px solid var(--border-color)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>Settings</h2>
          </div>
          
          <div className="settings-nav" style={{ padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button 
              onClick={() => setActiveTab('profile')}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '8px',
                background: activeTab === 'profile' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'profile' ? '#fff' : 'var(--text-primary)',
                border: 'none', cursor: 'pointer', textAlign: 'left', fontWeight: 500, transition: '0.2s'
              }}
            >
              <i className="fa-solid fa-user"></i> My Profile
            </button>
            <button 
              onClick={() => setActiveTab('security')}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '8px',
                background: activeTab === 'security' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'security' ? '#fff' : 'var(--text-primary)',
                border: 'none', cursor: 'pointer', textAlign: 'left', fontWeight: 500, transition: '0.2s'
              }}
            >
              <i className="fa-solid fa-shield-halved"></i> Security & Sessions
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="settings-content" style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>

          {activeTab === 'profile' && (
            <div className="settings-pane">
              <h3 style={{ margin: '0 0 24px 0', fontSize: '1.5rem', color: 'var(--text-primary)' }}>Profile Details</h3>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '32px' }}>
                <div style={{ 
                  width: '80px', height: '80px', borderRadius: '50%', background: 'var(--primary)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', 
                  fontSize: '2rem', fontWeight: 600 
                }}>
                  {currentUser?.displayName?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>@{currentUser?.username}</h4>
                  <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>{currentUser?.role || 'Employee'}</p>
                  <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Plan: <strong style={{ color: 'var(--primary)' }}>{currentUser?.subscriptionPlan || 'Free'}</strong>
                    {currentUser?.subscriptionStartDate && currentUser?.subscriptionEndDate && (
                      <span style={{ marginLeft: '8px' }}>
                        ({new Date(currentUser.subscriptionStartDate).toLocaleDateString()} - {new Date(currentUser.subscriptionEndDate).toLocaleDateString()})
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '400px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Username</label>
                  <input 
                    type="text" 
                    value={username} 
                    onChange={e => setUsername(e.target.value)} 
                    style={{ padding: '12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={isSavingProfile} style={{ padding: '12px', fontWeight: 600, marginTop: '8px', width: 'fit-content' }}>
                  {isSavingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </form>
            </div>
          )}



          {activeTab === 'security' && (
            <div className="settings-pane">
              <h3 style={{ margin: '0 0 24px 0', fontSize: '1.5rem', color: 'var(--text-primary)' }}>Security</h3>
              
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '32px' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>Change Password</h4>
                <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '300px' }}>
                  <input 
                    type="password" 
                    placeholder="New Password"
                    value={newPassword} 
                    onChange={e => setNewPassword(e.target.value)} 
                    style={{ padding: '12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  />
                  <button type="submit" className="btn btn-secondary" disabled={isChangingPassword} style={{ padding: '12px', fontWeight: 600 }}>
                    {isChangingPassword ? 'Updating...' : 'Update Password'}
                  </button>
                </form>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Active Sessions</h4>
                  <button onClick={handleRevokeAllSessions} className="btn btn-danger" style={{ padding: '8px 16px', fontSize: '0.9rem', fontWeight: 600, background: '#d83b01', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                    Revoke All Other Sessions
                  </button>
                </div>
                
                {isLoadingSessions ? (
                  <div style={{ color: 'var(--text-muted)' }}>Loading sessions...</div>
                ) : activeSessions.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)' }}>No active sessions found.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {activeSessions.map(session => (
                      <div key={session.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <i className="fa-solid fa-desktop" style={{ fontSize: '1.5rem', color: 'var(--primary)' }}></i>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{session.deviceInfo || 'Unknown Device'}</div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>IP: {session.ipAddress} • Last active: {new Date(session.lastActive).toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
