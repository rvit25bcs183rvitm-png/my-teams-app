import React, { useState, useEffect } from 'react';
import { BASE_URL } from '../config';

function AdminPanel({ token, currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    displayName: '',
    firstName: '',
    lastName: '',
    email: '',
    roleName: 'Employee',
    department: '',
    team: ''
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdResult, setCreatedResult] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setUsers(await res.json());
      } else {
        setError('Failed to fetch users.');
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    setCreatedResult(null);

    const payload = { ...newUser };
    if (!payload.password) {
      delete payload.password; // let backend auto-generate
    }

    try {
      const res = await fetch(`${BASE_URL}/api/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const result = await res.json();
        setCreatedResult(result);
        fetchUsers();
        setNewUser({
          username: '', password: '', displayName: '', firstName: '', lastName: '', email: '', roleName: 'Employee', department: '', team: ''
        });
      } else {
        const errData = await res.json();
        setCreateError(errData.error || errData.Error || 'Failed to create user.');
      }
    } catch (err) {
      setCreateError(err.message);
    }
    setCreating(false);
  };

  return (
    <div style={{ padding: '32px', flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
          <i className="fa-solid fa-shield-halved" style={{ marginRight: '12px', color: 'var(--secondary)' }}></i> Security & Administration
        </h2>
        <button className="btn btn-primary" onClick={() => { setShowAddModal(true); setCreatedResult(null); }}>
          <i className="fa-solid fa-user-plus" style={{ marginRight: '8px' }}></i> Add New User
        </button>
      </div>

      {error && <div className="login-error" style={{ marginBottom: '16px' }}>{error}</div>}

      <div className="table-container" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '0', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)' }}>
        {loading ? (
          <p style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading users...</p>
        ) : (
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Username</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Display Name</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Role</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background-color 0.2s ease' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <td style={{ padding: '16px 24px', fontWeight: 500 }}>{u.username}</td>
                  <td style={{ padding: '16px 24px' }}>{u.displayName}</td>
                  <td style={{ padding: '16px 24px' }}>
                    <span style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: u.role === 'Administrator' || u.role === 'Super Administrator' ? 'rgba(244, 63, 94, 0.15)' : 'var(--primary-light)', color: u.role === 'Administrator' || u.role === 'Super Administrator' ? 'var(--secondary)' : 'var(--primary)' }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: u.accountStatus === 'Active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)', color: u.accountStatus === 'Active' ? 'var(--online)' : 'var(--away)' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: u.accountStatus === 'Active' ? 'var(--online)' : 'var(--away)' }}></span>
                      {u.accountStatus} {u.isTemporaryPassword ? '(Must Change Pwd)' : ''}
                    </span>
                  </td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-muted)' }}>{new Date(u.createdDate).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ width: '550px', maxWidth: '90%', padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>Add New User</h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', padding: '4px', borderRadius: '4px', transition: 'all 0.2s' }} onClick={() => setShowAddModal(false)} onMouseEnter={e => {e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.backgroundColor = 'var(--bg-hover)';}} onMouseLeave={e => {e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'transparent';}}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {createdResult ? (
              <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--online)', padding: '24px', borderRadius: '12px', marginBottom: '20px' }}>
                <h4 style={{ color: 'var(--online)', marginTop: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-circle-check"></i> User Created Successfully!
                </h4>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>Please share these temporary credentials securely with the user. They will be forced to change this password on their first login.</p>
                <div style={{ backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', padding: '16px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '1.1rem', marginTop: '16px' }}>
                  <div style={{ marginBottom: '12px' }}><strong style={{ color: 'var(--text-muted)' }}>Username:</strong> <span style={{ color: 'var(--text-primary)' }}>{createdResult.username}</span></div>
                  <div><strong style={{ color: 'var(--text-muted)' }}>One-Time Password:</strong> <span style={{ color: 'var(--online)', fontWeight: 'bold' }}>{createdResult.temporaryPassword}</span></div>
                </div>
                <button className="btn btn-primary" style={{ width: '100%', marginTop: '24px', padding: '12px' }} onClick={() => setShowAddModal(false)}>Done</button>
              </div>
            ) : (
              <form onSubmit={handleCreateUser}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Username *</label>
                    <input type="text" style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', outline: 'none', transition: 'border-color 0.2s' }} onFocus={e => e.target.style.borderColor = 'var(--primary)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'} value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} required />
                  </div>
                  
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>One-Time Password (Optional)</label>
                    <input type="text" placeholder="Leave blank to auto-generate a secure password" style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', outline: 'none', transition: 'border-color 0.2s' }} onFocus={e => e.target.style.borderColor = 'var(--primary)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'} value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>First Name</label>
                    <input type="text" style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', outline: 'none', transition: 'border-color 0.2s' }} onFocus={e => e.target.style.borderColor = 'var(--primary)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'} value={newUser.firstName} onChange={e => setNewUser({...newUser, firstName: e.target.value})} />
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Last Name</label>
                    <input type="text" style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', outline: 'none', transition: 'border-color 0.2s' }} onFocus={e => e.target.style.borderColor = 'var(--primary)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'} value={newUser.lastName} onChange={e => setNewUser({...newUser, lastName: e.target.value})} />
                  </div>

                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Display Name *</label>
                    <input type="text" style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', outline: 'none', transition: 'border-color 0.2s' }} onFocus={e => e.target.style.borderColor = 'var(--primary)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'} value={newUser.displayName} onChange={e => setNewUser({...newUser, displayName: e.target.value})} required />
                  </div>

                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Role</label>
                    <select style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', outline: 'none', transition: 'border-color 0.2s', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%23cbd5e1\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px' }} onFocus={e => e.target.style.borderColor = 'var(--primary)'} onBlur={e => e.target.style.borderColor = 'var(--border-color)'} value={newUser.roleName} onChange={e => setNewUser({...newUser, roleName: e.target.value})}>
                      <option value="Employee">Employee</option>
                      <option value="Manager">Manager</option>
                      <option value="Administrator">Administrator</option>
                      <option value="Super Administrator">Super Administrator</option>
                    </select>
                  </div>
                </div>

                {createError && <div className="login-error" style={{ margin: '20px 0', padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid var(--busy)', color: '#fca5a5', borderRadius: '0 8px 8px 0' }}><i className="fa-solid fa-circle-exclamation" style={{ marginRight: '8px' }}></i>{createError}</div>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginTop: '32px' }}>
                  <button type="button" className="btn btn-secondary" style={{ padding: '10px 20px' }} onClick={() => setShowAddModal(false)} disabled={creating}>Cancel</button>
                  <button type="submit" className="btn btn-primary" style={{ padding: '10px 24px' }} disabled={creating}>
                    {creating ? <><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '8px' }}></i>Creating...</> : <><i className="fa-solid fa-check" style={{ marginRight: '8px' }}></i>Create Secure User</>}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPanel;
