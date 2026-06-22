import { useState, useEffect } from 'react';
import { BASE_URL } from '../config';
import BillingSection from './BillingSection';

export default function SettingsSection({ currentUser, token, onRefreshUser, showToast }) {
  const [activeSubTab, setActiveSubTab] = useState('profile');

  // Profile Form
  const [username, setUsername] = useState(currentUser?.username || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Security Form
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Sessions
  const [activeSessions, setActiveSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // Notifications state
  const [permissionState, setPermissionState] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    if (activeSubTab === 'account') {
      fetchSessions();
    }
  }, [activeSubTab]);

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
        showToast("Profile updated successfully!", "success");
        if (onRefreshUser) onRefreshUser();
      } else {
        const err = await response.json();
        showToast(`Failed to update profile: ${err.error || response.statusText}`, "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Error updating profile.", "error");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!newPassword) return;

    setIsChangingPassword(true);
    try {
      const response = await fetch(`${BASE_URL}/api/users/${currentUser.id}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword })
      });
      
      if (response.ok) {
        showToast("Password updated successfully!", "success");
        setNewPassword('');
      } else {
        const err = await response.json();
        showToast(`Failed to reset password: ${err.error || response.statusText}`, "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Error resetting password.", "error");
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
        showToast("All other sessions revoked.", "success");
        fetchSessions();
      } else {
        showToast("Failed to revoke sessions.", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Error revoking sessions.", "error");
    }
  };

  const handleRequestPermission = () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission().then(permission => {
        setPermissionState(permission);
      });
    }
  };

  const handleSendTestNotification = () => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification("Test Notification", {
        body: "This is a native OS test notification from your Communication Platform!",
        icon: "/favicon.ico"
      });
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      
      {/* Settings Sub-Sidebar */}
      <div style={{ width: '220px', background: 'var(--bg-panel)', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', padding: '16px 8px', gap: '4px' }}>
        {[
          { id: 'profile', label: 'Profile Settings', icon: 'fa-user' },
          { id: 'account', label: 'Account & Sessions', icon: 'fa-shield-halved' },
          { id: 'billing', label: 'Billing & Plan', icon: 'fa-credit-card' },
          { id: 'notifications', label: 'OS Notifications', icon: 'fa-bell' },
          { id: 'appearance', label: 'Appearance', icon: 'fa-palette' },
          { id: 'devices', label: 'Devices & A/V', icon: 'fa-video' }
        ].map(sub => (
          <button
            key={sub.id}
            onClick={() => setActiveSubTab(sub.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '8px',
              background: activeSubTab === sub.id ? 'var(--bg-active)' : 'transparent',
              color: activeSubTab === sub.id ? 'var(--text-primary)' : 'var(--text-muted)',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              fontWeight: 600,
              fontSize: '0.9rem',
              transition: 'all 0.15s'
            }}
          >
            <i className={`fa-solid ${sub.icon}`}></i> {sub.label}
          </button>
        ))}
      </div>

      {/* Settings Content Area */}
      <div style={{ flex: 1, padding: '32px', overflowY: 'auto', background: 'var(--bg-app)' }}>
        
        {/* Profile Settings */}
        {activeSubTab === 'profile' && (
          <div style={{ maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.4rem', fontWeight: 700 }}>Profile Settings</h3>
            <p style={{ margin: '0 0 24px 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Customize your identity on the platform.</p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '32px' }}>
              <div style={{ 
                width: '72px', height: '72px', borderRadius: '18px', background: 'var(--primary)', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', 
                fontSize: '1.8rem', fontWeight: 600 
              }}>
                {(username || 'U').charAt(0).toUpperCase()}
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.15rem', color: '#fff' }}>@{currentUser?.username}</h4>
                <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Role: {currentUser?.role || 'Employee'}</p>
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

            <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Username</label>
                <input 
                  type="text" 
                  value={username} 
                  onChange={e => setUsername(e.target.value)} 
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    color: '#fff',
                    outline: 'none',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={isSavingProfile}
                style={{ padding: '12px 24px', fontWeight: 'bold', width: 'fit-content', borderRadius: '8px' }}
              >
                {isSavingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </form>
          </div>
        )}

        {/* Account & Sessions */}
        {activeSubTab === 'account' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '600px' }}>
            <div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1.4rem', fontWeight: 700 }}>Security & Active Sessions</h3>
              <p style={{ margin: '0 0 24px 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Manage credentials and active logins.</p>
            </div>

            {/* Change Password */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600 }}>Change Password</h4>
              <form onSubmit={handleResetPassword} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <input 
                  type="password" 
                  placeholder="Enter new password"
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                  style={{
                    flex: 1,
                    minWidth: '200px',
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                    color: '#fff',
                    outline: 'none'
                  }}
                />
                <button type="submit" className="btn btn-primary" disabled={isChangingPassword} style={{ padding: '12px 24px', borderRadius: '8px' }}>
                  Update
                </button>
              </form>
            </div>

            {/* Active Sessions */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Active Logins</h4>
                <button onClick={handleRevokeAllSessions} style={{ color: 'var(--secondary)', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                  Revoke All Others
                </button>
              </div>

              {isLoadingSessions ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading sessions...</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {activeSessions.map(sess => (
                    <div 
                      key={sess.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px',
                        borderRadius: '8px',
                        background: 'rgba(255,255,255,0.01)',
                        border: '1px solid var(--border-color)'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>
                          {sess.deviceName} ({sess.deviceType})
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          IP: {sess.ipAddress} • Active: {new Date(sess.lastActivity).toLocaleTimeString()}
                        </div>
                      </div>
                      {sess.isCurrentSession ? (
                        <span style={{ fontSize: '0.8rem', color: 'var(--online)', fontWeight: 'bold', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>Current</span>
                      ) : (
                        <button 
                          onClick={async () => {
                            if (confirm("Revoke this session?")) {
                              const res = await fetch(`${BASE_URL}/api/sessions/revoke/${sess.id}`, {
                                method: 'POST',
                                headers: { "Authorization": `Bearer ${token}` }
                              });
                              if (res.ok) fetchSessions();
                            }
                          }}
                          style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Billing Settings */}
        {activeSubTab === 'billing' && (
          <BillingSection token={token} currentUser={currentUser} />
        )}

        {/* Notifications Settings */}
        {activeSubTab === 'notifications' && (
          <div style={{ maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1.4rem', fontWeight: 700 }}>OS Notifications Settings</h3>
              <p style={{ margin: '0 0 24px 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Configure native desktop notifications for chats, calls, and meetings.</p>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Permission Status:</span>
                <span style={{ 
                  fontWeight: 'bold', 
                  fontSize: '0.85rem', 
                  padding: '4px 12px', 
                  borderRadius: '4px',
                  backgroundColor: 
                    permissionState === 'granted' ? 'rgba(16, 185, 129, 0.15)' : 
                    permissionState === 'denied' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  color: 
                    permissionState === 'granted' ? 'var(--online)' : 
                    permissionState === 'denied' ? 'var(--secondary)' : '#f59e0b'
                }}>
                  {permissionState.toUpperCase()}
                </span>
              </div>

              {permissionState === 'default' && (
                <div>
                  <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Enable OS notifications to receive native alerts for new chats, incoming calls, and scheduled meetings even when the window is in the background.
                  </p>
                  <button 
                    onClick={handleRequestPermission}
                    className="btn btn-primary"
                    style={{ padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold' }}
                  >
                    Enable Desktop Notifications
                  </button>
                </div>
              )}

              {permissionState === 'denied' && (
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)', lineHeight: '1.4' }}>
                  <i className="fa-solid fa-triangle-exclamation" style={{ color: 'var(--secondary)', marginRight: '8px' }}></i>
                  <strong>Blocked by Browser Settings:</strong> OS notifications have been disabled for this site. To enable them:
                  <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                    <li>Click the lock/settings icon in the browser address bar.</li>
                    <li>Toggle <strong>Notifications</strong> to <strong>Allow</strong>.</li>
                    <li>Reload the page.</li>
                  </ol>
                </div>
              )}

              {permissionState === 'granted' && (
                <div>
                  <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Desktop notifications are active. You will receive native OS notifications for all chat messages, incoming calls, and meeting starts.
                  </p>
                  <button 
                    onClick={handleSendTestNotification}
                    className="btn btn-secondary"
                    style={{ padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold' }}
                  >
                    Send Test Notification
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Appearance Settings */}
        {activeSubTab === 'appearance' && (
          <div style={{ maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.4rem', fontWeight: 700 }}>Appearance</h3>
            <p style={{ margin: '0 0 24px 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Choose your visual theme styling preferences.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
              {[
                { id: 'dark', label: 'Indigo Dark', color: '#6366f1' },
                { id: 'light', label: 'Company Light', color: '#ebebeb' },
                { id: 'midnight', label: 'Midnight Pitch', color: '#0d1117' }
              ].map(theme => (
                <div 
                  key={theme.id}
                  onClick={() => {
                    const root = document.documentElement;
                    root.className = `theme-${theme.id}`;
                    localStorage.setItem('theme', theme.id);
                  }}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    padding: '20px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    transition: 'border-color 0.2s'
                  }}
                >
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: theme.color, margin: '0 auto 12px auto' }}></div>
                  <div style={{ color: '#fff', fontSize: '0.9rem' }}>{theme.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Devices Settings */}
        {activeSubTab === 'devices' && (
          <div style={{ maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1.4rem', fontWeight: 700 }}>Audio & Video Devices</h3>
              <p style={{ margin: '0 0 24px 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Configure web cams, microphones, and output speakers.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Camera Input</label>
              <select style={{ padding: '12px', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: '#fff', outline: 'none' }}>
                <option>Default Integrated Webcam</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Microphone Input</label>
              <select style={{ padding: '12px', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: '#fff', outline: 'none' }}>
                <option>Default Internal Microphone Array</option>
              </select>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
