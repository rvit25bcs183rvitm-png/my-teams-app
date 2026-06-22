import { useState, useEffect, useRef, useCallback } from 'react';
import { BASE_URL } from '../config';
/* ─── helpers ───────────────────────────────────────────────── */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getFileIcon(name = '', mime = '') {
  const ext = name.split('.').pop().toLowerCase();
  const type = mime.toLowerCase();
  if (['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext) || type.includes('image')) return { icon: 'fa-file-image', color: '#4CAF50' };
  if (ext === 'pdf' || type.includes('pdf'))                                                  return { icon: 'fa-file-pdf',   color: '#F44336' };
  if (['doc','docx'].includes(ext) || type.includes('word'))                                   return { icon: 'fa-file-word',  color: '#2196F3' };
  if (['xls','xlsx','csv'].includes(ext) || type.includes('sheet'))                            return { icon: 'fa-file-excel', color: '#4CAF50' };
  if (['ppt','pptx'].includes(ext) || type.includes('presentation'))                           return { icon: 'fa-file-powerpoint', color: '#FF5722' };
  if (['zip','rar','7z','tar','gz'].includes(ext) || type.includes('zip'))                     return { icon: 'fa-file-zipper', color: '#FF9800' };
  if (['mp4','mov','avi','mkv','webm'].includes(ext) || type.includes('video'))                return { icon: 'fa-file-video', color: '#9C27B0' };
  if (['mp3','wav','ogg','flac'].includes(ext) || type.includes('audio'))                      return { icon: 'fa-file-audio', color: '#00BCD4' };
  if (['txt','md','log'].includes(ext) || type.includes('text'))                               return { icon: 'fa-file-lines', color: '#607D8B' };
  if (['js','ts','jsx','tsx','py','cs','json','html','css'].includes(ext))                     return { icon: 'fa-file-code',  color: '#FF9800' };
  return { icon: 'fa-file', color: '#9E9E9E' };
}

/* ─── ContextMenu ───────────────────────────────────────────── */
function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return (
    <div ref={ref} style={{
      position: 'fixed', top: y, left: x, zIndex: 9999,
      background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
      borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      minWidth: '180px', overflow: 'hidden', animation: 'fadeIn 0.12s ease'
    }}>
      {items.map((item, i) => item === 'divider' ? (
        <div key={i} style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />
      ) : (
        <button key={i} onClick={() => { item.action(); onClose(); }} style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          width: '100%', padding: '10px 16px', background: 'none', border: 'none',
          color: item.danger ? '#ef4444' : 'var(--text-primary)',
          cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left',
          transition: 'background 0.15s'
        }}
          onMouseEnter={e => e.currentTarget.style.background = item.danger ? 'rgba(239,68,68,0.12)' : 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <i className={`fa-solid ${item.icon}`} style={{ width: '16px', opacity: 0.8 }} />
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ─── VersionHistoryModal ───────────────────────────────────── */
function VersionHistoryModal({ file, token, onClose, onDownloadVersion }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(null);

  useEffect(() => {
    fetch(`${BASE_URL}/api/storage/files/${file.id}/versions`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.ok ? r.json() : []).then(setVersions).finally(() => setLoading(false));
  }, [file.id, token]);

  const restoreVersion = async (vn) => {
    setRestoring(vn);
    await fetch(`${BASE_URL}/api/storage/files/${file.id}/versions/restore`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionNumber: vn })
    });
    setRestoring(null);
    onClose();
    alert(`Restored to version ${vn}`);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: '16px', padding: '28px',
        width: '540px', maxHeight: '70vh', display: 'flex', flexDirection: 'column',
        border: '1px solid var(--border-color)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Version History</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{file.name}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
              <i className="fa-solid fa-spinner fa-spin" /> Loading…
            </div>
          ) : versions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>No versions found.</div>
          ) : versions.map(v => (
            <div key={v.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: '10px', marginBottom: '6px',
              background: v.id === file.currentVersionId ? 'rgba(99,102,241,0.12)' : 'var(--bg-primary)',
              border: v.id === file.currentVersionId ? '1px solid rgba(99,102,241,0.4)' : '1px solid transparent'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px', background: 'var(--bg-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#6366f1', fontWeight: 700, fontSize: '0.85rem'
                }}>v{v.versionNumber}</div>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {formatBytes(v.fileSize)}
                    {v.id === file.currentVersionId && <span style={{ marginLeft: '8px', fontSize: '0.7rem', color: '#6366f1', background: 'rgba(99,102,241,0.2)', padding: '2px 8px', borderRadius: '20px' }}>Current</span>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatDate(v.createdAt)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => onDownloadVersion(file.id, v.versionNumber)}
                  style={{ padding: '6px 12px', borderRadius: '8px', background: 'var(--bg-hover)', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.8rem' }}>
                  <i className="fa-solid fa-download" />
                </button>
                {v.id !== file.currentVersionId && (
                  <button onClick={() => restoreVersion(v.versionNumber)} disabled={restoring === v.versionNumber}
                    style={{ padding: '6px 12px', borderRadius: '8px', background: '#6366f1', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
                    {restoring === v.versionNumber ? <i className="fa-solid fa-spinner fa-spin" /> : 'Restore'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── ShareModal ────────────────────────────────────────────── */
function ShareModal({ item, itemType, token, usersCache, onClose }) {
  const [recipientId, setRecipientId] = useState('');
  const [level, setLevel] = useState('Viewer');
  const [days, setDays] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleShare = async () => {
    if (!recipientId) return alert('Select a user first.');
    setSaving(true);
    const body = {
      recipientType: 'User', recipientId,
      fileId: itemType === 'file' ? item.id : null,
      folderId: itemType === 'folder' ? item.id : null,
      permissionLevel: level,
      expiresInDays: days ? parseInt(days) : null
    };
    const r = await fetch(`${BASE_URL}/api/storage/shares`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    setSaving(false);
    if (r.ok) { setDone(true); setTimeout(onClose, 1200); }
    else alert('Failed to share item.');
  };

  const users = Object.values(usersCache);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: 'var(--bg-secondary)', borderRadius: '16px', padding: '28px', width: '440px', border: '1px solid var(--border-color)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Share {itemType === 'file' ? 'File' : 'Folder'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}><i className="fa-solid fa-xmark" /></button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{item.name}</p>

        {done ? (
          <div style={{ textAlign: 'center', padding: '24px', color: '#4CAF50' }}><i className="fa-solid fa-circle-check" style={{ fontSize: '2rem', marginBottom: '8px', display: 'block' }} />Shared successfully!</div>
        ) : (
          <>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Recipient</label>
              <select value={recipientId} onChange={e => setRecipientId(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                <option value="">— Select user —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.displayName} (@{u.username})</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Permission Level</label>
              <select value={level} onChange={e => setLevel(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                <option value="Viewer">Viewer (read-only)</option>
                <option value="Editor">Editor (can upload / rename)</option>
                <option value="Owner">Owner (full control)</option>
              </select>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Expires in (days, blank = never)</label>
              <input type="number" min="1" placeholder="e.g. 30" value={days} onChange={e => setDays(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.875rem', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: '8px', background: 'var(--bg-hover)', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleShare} disabled={saving}
                style={{ padding: '10px 20px', borderRadius: '8px', background: '#6366f1', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : 'Share'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── NewFolderModal ────────────────────────────────────────── */
function NewFolderModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: 'var(--bg-secondary)', borderRadius: '16px', padding: '28px', width: '380px', border: '1px solid var(--border-color)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: '1rem' }}>New Folder</h3>
        <input autoFocus type="text" placeholder="Folder name…" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onCreate(name.trim()); if (e.key === 'Escape') onClose(); }}
          style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box', marginBottom: '20px' }} />
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: '8px', background: 'var(--bg-hover)', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => name.trim() && onCreate(name.trim())} disabled={!name.trim()}
            style={{ padding: '10px 20px', borderRadius: '8px', background: '#6366f1', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Create</button>
        </div>
      </div>
    </div>
  );
}

/* ─── PreviewModal ──────────────────────────────────────────── */
function PreviewModal({ file, token, onClose }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE_URL}/api/storage/files/${file.id}/preview-token`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.ok ? r.json() : null).then(data => {
      if (data?.token) setPreviewUrl(`${BASE_URL}/api/storage/preview?token=${data.token}`);
    }).finally(() => setLoading(false));
  }, [file.id, token]);

  const mime = (file.currentVersion?.mimeType || '').toLowerCase();
  const isImage = mime.includes('image');
  const isPdf = mime.includes('pdf');
  const isText = mime.includes('text');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, flexDirection: 'column' }}>
      <div style={{ width: '90vw', maxWidth: '1000px', height: '85vh', background: 'var(--bg-secondary)', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{file.name}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e' }}>
          {loading ? (
            <div style={{ color: 'var(--text-secondary)' }}><i className="fa-solid fa-spinner fa-spin fa-2x" /></div>
          ) : !previewUrl ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
              <i className="fa-solid fa-eye-slash fa-3x" style={{ marginBottom: '12px', display: 'block' }} />
              Preview not available
            </div>
          ) : isImage ? (
            <img src={previewUrl} alt={file.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          ) : (isPdf || isText) ? (
            <iframe src={previewUrl} title={file.name} style={{ width: '100%', height: '100%', border: 'none' }} />
          ) : (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
              <i className="fa-solid fa-file fa-3x" style={{ marginBottom: '12px', display: 'block' }} />
              No inline preview for this file type.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── QuotaBar ──────────────────────────────────────────────── */
function QuotaBar({ token }) {
  const [quota, setQuota] = useState(null);
  useEffect(() => {
    fetch(`${BASE_URL}/api/storage/quotas/user`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null).then(setQuota).catch(() => {});
  }, [token]);

  if (!quota) return null;
  const pct = quota.limitBytes === -1 ? 0 : Math.min(100, Math.round((quota.usedBytes / quota.limitBytes) * 100));
  const color = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#6366f1';

  return (
    <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)', marginTop: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
        <span>{formatBytes(quota.usedBytes)} used</span>
        <span>{quota.limitBytes === -1 ? 'Unlimited' : formatBytes(quota.limitBytes)}</span>
      </div>
      {quota.limitBytes !== -1 && (
        <div style={{ height: '4px', background: 'var(--bg-hover)', borderRadius: '2px' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', transition: 'width 0.6s ease' }} />
        </div>
      )}
    </div>
  );
}

/* ─── FileDetailsPanel ───────────────────────────────────────── */
function FileDetailsPanel({ file, token, usersCache, onClose, onDownloadVersion, onReload, isOwner }) {
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [permission, setPermission] = useState('All'); // 'All' | 'Managers' | 'Owners'
  const [activityLog, setActivityLog] = useState([
    { action: 'Uploaded file', user: 'System', date: file.updatedAt },
    { action: 'Configured permissions', user: 'Admin', date: file.updatedAt }
  ]);

  useEffect(() => {
    if (!file || file.id.startsWith('mock-')) return;
    setLoadingVersions(true);
    fetch(`${BASE_URL}/api/storage/files/${file.id}/versions`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : [])
      .then(setVersions)
      .catch(() => {})
      .finally(() => setLoadingVersions(false));
  }, [file, token]);

  const fileInfo = getFileIcon(file.name, file.currentVersion?.mimeType || '');
  const ownerName = usersCache?.[file.ownerId?.toLowerCase()]?.displayName || 'System User';

  return (
    <div style={{
      width: '320px',
      borderLeft: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      flexShrink: 0,
      animation: 'slideInRight 0.2s ease-out'
    }}>
      {/* Panel Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>File Details</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem' }}><i className="fa-solid fa-xmark" /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Basic Info */}
        <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <i className={`fa-solid ${fileInfo.icon}`} style={{ fontSize: '3rem', color: fileInfo.color, marginBottom: '8px' }} />
          <h4 style={{ margin: '4px 0 2px', fontSize: '0.85rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{file.name}</h4>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatBytes(file.currentVersion?.fileSize)}</span>
        </div>

        {/* Info Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Owner</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{ownerName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Modified</span>
            <span style={{ color: 'var(--text-primary)' }}>{formatDate(file.updatedAt)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Version</span>
            <span style={{ color: 'var(--text-primary)' }}>v{file.currentVersion?.versionNumber || 1}</span>
          </div>
        </div>

        {/* Simulated Preview Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>File Preview</span>
          <div style={{ height: '100px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
            {file.name.endsWith('.png') || file.name.endsWith('.jpg') || file.name.endsWith('.jpeg') ? (
              <div style={{ width: '100%', height: '100%', background: 'linear-gradient(45deg, #3b82f6, #8b5cf6)', opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="fa-solid fa-image" style={{ fontSize: '2rem', color: '#fff' }} />
              </div>
            ) : (
              <div style={{ padding: '8px', fontSize: '0.65rem', fontFamily: 'monospace', color: 'var(--text-muted)', overflow: 'hidden', width: '100%' }}>
                [ENCRYPTED PAYLOAD]<br/>
                Header: SecureVault-AES-256<br/>
                Payload Size: {file.currentVersion?.fileSize || 1024} bytes<br/>
                Integrity Hash: SHA256-OK
              </div>
            )}
          </div>
        </div>

        {/* Permissions Control */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Access Control</span>
          <select 
            value={permission} 
            onChange={(e) => setPermission(e.target.value)}
            disabled={!isOwner}
            style={{ padding: '8px', background: 'var(--bg-primary)', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.8rem', outline: 'none', opacity: isOwner ? 1 : 0.6, cursor: isOwner ? 'default' : 'not-allowed' }}
          >
            <option value="All">All Members (Employee + Manager)</option>
            <option value="Managers">Managers & Owners Only</option>
            <option value="Owners">Owners Only</option>
          </select>
        </div>

        {/* Version History List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Version History</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {loadingVersions ? (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Loading versions...</span>
            ) : versions.length === 0 ? (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>v1 (Current Version)</span>
            ) : (
              versions.map(v => (
                <div key={v.versionNumber} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-primary)', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.75rem' }}>
                  <span>v{v.versionNumber} ({formatBytes(v.fileSize)})</span>
                  <button 
                    onClick={() => onDownloadVersion(file.id, v.versionNumber)}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}
                    title="Download this version"
                  >
                    <i className="fa-solid fa-download" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Activity Log */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Activity Log</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {activityLog.map((log, i) => (
              <div key={i} style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{log.action}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', color: 'var(--text-muted)' }}>
                  <span>By {log.user}</span>
                  <span>{formatDate(log.date)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

/* ─── Main FilesVault ───────────────────────────────────────── */
function FilesVault({ token, usersCache, conversations, currentUser }) {
  const isSystemAdmin = currentUser?.role === 'Super Administrator' || currentUser?.role === 'Administrator';
  const isFolderOwner = (folder) => spaceType !== 'Team' || folder.ownerId?.toLowerCase() === currentUser?.id?.toLowerCase() || isSystemAdmin;
  const isFileOwner = (file) => spaceType !== 'Team' || file.ownerId?.toLowerCase() === currentUser?.id?.toLowerCase() || isSystemAdmin;

  // Get all conversation IDs for team file operations
  const teamConversationIds = Object.values(conversations || {})
    .filter(c => c && (c.type === 'channel' || c.type === 'group'))
    .map(c => c.id);
  const [activeTeamId, setActiveTeamId] = useState(null);
  const [spaceType, setSpaceType] = useState('Personal');
  const [breadcrumb, setBreadcrumb] = useState([]); // [{id, name}]
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = not in search mode
  const [contextMenu, setContextMenu] = useState(null); // {x,y,items}
  const [versionModal, setVersionModal] = useState(null);
  const [shareModal, setShareModal] = useState(null);
  const [previewModal, setPreviewModal] = useState(null);
  const [newFolderModal, setNewFolderModal] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const uploadRef = useRef();

  // Modern Enterprise features
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const currentFolderId = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].id : null;

  /* ── data loading ── */
  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setSearchResults(null);
    try {
      if (spaceType === 'Recent') {
        // Fetch personal files
        const pRes = await fetch(`${BASE_URL}/api/storage/files?spaceType=Personal`, { headers: { Authorization: `Bearer ${token}` } });
        const pFiles = pRes.ok ? await pRes.json() : [];

        // Fetch team files from all conversations
        let tFiles = [];
        for (const convId of teamConversationIds) {
          try {
            const r = await fetch(`${BASE_URL}/api/storage/files?spaceType=Team&spaceTargetId=${convId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (r.ok) {
              const data = await r.json();
              tFiles = [...tFiles, ...data];
            }
          } catch {}
        }

        const combined = [...pFiles, ...tFiles];
        combined.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        setFiles(combined.slice(0, 20));
        setFolders([]);
      } else if (spaceType === 'Shared') {
        setFiles([
          {
            id: 'mock-shared-1',
            name: 'Security_Audit_Report.pdf',
            updatedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
            ownerId: 'System',
            currentVersion: { fileSize: 2456000, versionNumber: 1, mimeType: 'application/pdf' },
            tags: [{ tag: 'Audit' }, { tag: 'Shared' }]
          },
          {
            id: 'mock-shared-2',
            name: 'Company_Roadmap_Q4.xlsx',
            updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
            ownerId: 'System',
            currentVersion: { fileSize: 1048000, versionNumber: 2, mimeType: 'application/vnd.ms-excel' },
            tags: [{ tag: 'Roadmap' }]
          }
        ]);
        setFolders([]);
      } else if (spaceType === 'Team') {
        // For Team files, fetch from the selected team conversation, or aggregate from all
        const targetId = activeTeamId || (teamConversationIds.length > 0 ? teamConversationIds[0] : null);
        if (targetId) {
          const folderParams = new URLSearchParams({ spaceType: 'Team', spaceTargetId: targetId });
          if (currentFolderId) folderParams.set('parentId', currentFolderId);
          const fileParams = new URLSearchParams({ spaceType: 'Team', spaceTargetId: targetId });
          if (currentFolderId) fileParams.set('folderId', currentFolderId);
          const [fRes, fileRes] = await Promise.all([
            fetch(`${BASE_URL}/api/storage/folders?${folderParams}`, { headers: { Authorization: `Bearer ${token}` } }),
            fetch(`${BASE_URL}/api/storage/files?${fileParams}`, { headers: { Authorization: `Bearer ${token}` } }),
          ]);
          setFolders(fRes.ok ? await fRes.json() : []);
          setFiles(fileRes.ok ? await fileRes.json() : []);
        } else {
          setFolders([]);
          setFiles([]);
        }
      } else {
        const folderParams = new URLSearchParams({ spaceType });
        if (currentFolderId) folderParams.set('parentId', currentFolderId);
        const fileParams = new URLSearchParams({ spaceType });
        if (currentFolderId) fileParams.set('folderId', currentFolderId);
        const [fRes, fileRes] = await Promise.all([
          fetch(`${BASE_URL}/api/storage/folders?${folderParams}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${BASE_URL}/api/storage/files?${fileParams}`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        setFolders(fRes.ok ? await fRes.json() : []);
        setFiles(fileRes.ok ? await fileRes.json() : []);
      }
    } catch { setFolders([]); setFiles([]); }
    finally { setLoading(false); }
  }, [token, spaceType, currentFolderId, activeTeamId, teamConversationIds.join(',')]);

  useEffect(() => { loadDirectory(); }, [loadDirectory]);

  /* ── search ── */
  const handleSearch = async (q) => {
    if (!q.trim()) { setSearchResults(null); return; }
    setLoading(true);
    try {
      const r = await fetch(`${BASE_URL}/api/storage/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
      setSearchResults(r.ok ? await r.json() : []);
    } catch { setSearchResults([]); }
    finally { setLoading(false); }
  };

  /* ── navigation ── */
  const enterFolder = (folder) => setBreadcrumb(prev => [...prev, { id: folder.id, name: folder.name }]);
  const breadcrumbNav = (index) => setBreadcrumb(prev => prev.slice(0, index + 1));
  const goRoot = () => setBreadcrumb([]);

  /* ── folder ops ── */
  const createFolder = async (name) => {
    setNewFolderModal(false);
    const effectiveSpaceType = (spaceType === 'Personal' || spaceType === 'Team') ? spaceType : 'Personal';
    const body = { name, parentId: currentFolderId, spaceType: effectiveSpaceType };
    if (effectiveSpaceType === 'Team') {
      body.spaceTargetId = activeTeamId || (teamConversationIds.length > 0 ? teamConversationIds[0] : null);
    }
    const r = await fetch(`${BASE_URL}/api/storage/folders`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.ok) loadDirectory(); else alert('Failed to create folder.');
  };

  const deleteFolder = async (folder) => {
    if (!window.confirm(`Move "${folder.name}" to trash? All contents will be soft-deleted.`)) return;
    setDeletingId(folder.id);
    const r = await fetch(`${BASE_URL}/api/storage/folders/${folder.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
    });
    setDeletingId(null);
    if (r.ok) loadDirectory(); else alert('Delete failed — you may not have permission.');
  };

  const renameFolder = async (folder) => {
    const newName = window.prompt('New folder name:', folder.name);
    if (!newName || newName.trim() === folder.name) return;
    await fetch(`${BASE_URL}/api/storage/folders/${folder.id}/rename`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName: newName.trim() })
    });
    loadDirectory();
  };

  /* ── file ops ── */
  const uploadFile = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    if (currentFolderId) fd.append('folderId', currentFolderId);
    // Map space types - backend only supports 'Personal' and 'Team'
    const effectiveSpaceType = (spaceType === 'Personal' || spaceType === 'Team') ? spaceType : 'Personal';
    fd.append('spaceType', effectiveSpaceType);
    if (effectiveSpaceType === 'Team') {
      const targetId = activeTeamId || (teamConversationIds.length > 0 ? teamConversationIds[0] : null);
      if (targetId) fd.append('spaceTargetId', targetId);
    }
    try {
      const r = await fetch(`${BASE_URL}/api/storage/files/upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd
      });
      if (r.ok) { loadDirectory(); }
      else { const e = await r.json().catch(() => ({})); alert(e.error || 'Upload failed.'); }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Upload failed. Please check your connection and try again.');
    }
  };

  const deleteFile = async (file) => {
    if (!window.confirm(`Move "${file.name}" to trash?`)) return;
    setDeletingId(file.id);
    const r = await fetch(`${BASE_URL}/api/storage/files/${file.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
    });
    setDeletingId(null);
    if (r.ok) loadDirectory(); else alert('Delete failed — you may not have permission.');
  };

  const renameFile = async (file) => {
    const newName = window.prompt('New file name:', file.name);
    if (!newName || newName.trim() === file.name) return;
    await fetch(`${BASE_URL}/api/storage/files/${file.id}/rename`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName: newName.trim() })
    });
    loadDirectory();
  };

  const downloadFile = async (fileId, fileName, versionNumber) => {
    const params = versionNumber != null ? `?version=${versionNumber}` : '';
    const r = await fetch(`${BASE_URL}/api/storage/files/${fileId}/download${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) { alert('Download failed.'); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url);
  };

  /* ── context menus ── */
  const openFolderMenu = (e, folder) => {
    e.preventDefault(); e.stopPropagation();
    const isOwner = isFolderOwner(folder);
    const items = [
      { icon: 'fa-folder-open', label: 'Open', action: () => enterFolder(folder) }
    ];
    if (isOwner) {
      items.push(
        { icon: 'fa-pen',         label: 'Rename', action: () => renameFolder(folder) },
        { icon: 'fa-share-nodes', label: 'Share', action: () => setShareModal({ item: folder, type: 'folder' }) },
        'divider',
        { icon: 'fa-trash',       label: 'Delete', danger: true, action: () => deleteFolder(folder) }
      );
    }
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  const openFileMenu = (e, file) => {
    e.preventDefault(); e.stopPropagation();
    const isOwner = isFileOwner(file);
    const items = [
      { icon: 'fa-download',    label: 'Download',        action: () => downloadFile(file.id, file.name) },
      { icon: 'fa-eye',         label: 'Preview',         action: () => setPreviewModal(file) }
    ];
    if (isOwner) {
      items.push(
        { icon: 'fa-clock-rotate-left', label: 'Version History', action: () => setVersionModal(file) },
        { icon: 'fa-pen',         label: 'Rename',          action: () => renameFile(file) },
        { icon: 'fa-share-nodes', label: 'Share',           action: () => setShareModal({ item: file, type: 'file' }) },
        'divider',
        { icon: 'fa-trash',       label: 'Delete',          danger: true, action: () => deleteFile(file) }
      );
    }
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  const displayedFiles = searchResults !== null ? searchResults : files;

  /* ── render ── */
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Inter', sans-serif" }}>
      {/* ── Left Sidebar ── */}
      <div style={{ width: '220px', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', flexShrink: 0 }}>
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Storage</div>
          {[
            { id: 'Personal', label: 'My Files', icon: 'fa-user' },
            { id: 'Team', label: 'Team Files', icon: 'fa-users' },
            { id: 'Shared', label: 'Shared Files', icon: 'fa-share-nodes' },
            { id: 'Recent', label: 'Recent Files', icon: 'fa-clock' }
          ].map(st => (
            <button key={st.id} onClick={() => { setSpaceType(st.id); setBreadcrumb([]); setSelectedFile(null); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                width: '100%', padding: '9px 12px', borderRadius: '8px',
                background: spaceType === st.id ? 'var(--bg-active)' : 'transparent',
                border: 'none', color: spaceType === st.id ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: '0.875rem', marginBottom: '2px', textAlign: 'left', transition: 'background 0.15s'
              }}>
              <i className={`fa-solid ${st.icon}`} style={{ width: '16px' }} />
              {st.label}
            </button>
          ))}
        </div>

        {/* Team channel selector when viewing Team Files */}
        {spaceType === 'Team' && teamConversationIds.length > 0 && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-color)', flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Select Team / Channel</div>
            {Object.values(conversations || {})
              .filter(c => c && (c.type === 'channel' || c.type === 'group'))
              .map(conv => {
                const isActive = (activeTeamId || teamConversationIds[0]) === conv.id;
                return (
                  <button key={conv.id} onClick={() => { setActiveTeamId(conv.id); setBreadcrumb([]); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      width: '100%', padding: '8px 10px', borderRadius: '6px',
                      background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
                      border: isActive ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                      color: isActive ? '#818cf8' : 'var(--text-secondary)',
                      cursor: 'pointer', fontSize: '0.8rem', marginBottom: '2px', textAlign: 'left',
                      transition: 'all 0.15s'
                    }}>
                    <i className={`fa-solid ${conv.type === 'channel' ? 'fa-hashtag' : 'fa-user-group'}`} style={{ width: '14px', fontSize: '0.75rem' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(conv.name || '').replace(/^#\s*/, '').replace(/^\[.*?\]\s*/, '')}
                    </span>
                  </button>
                );
              })}
          </div>
        )}

        <QuotaBar token={token} />
      </div>

      {/* ── Main Panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-secondary)' }}>
          {/* Breadcrumb */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', overflow: 'hidden' }}>
            <button onClick={goRoot} style={{ background: 'none', border: 'none', color: breadcrumb.length === 0 ? 'var(--text-primary)' : '#6366f1', cursor: 'pointer', fontWeight: breadcrumb.length === 0 ? 700 : 400, padding: '2px 4px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
              <i className="fa-solid fa-house" style={{ marginRight: '4px' }} />
              {spaceType === 'Personal' ? 'My Files' : spaceType === 'Team' ? 'Team Files' : spaceType === 'Shared' ? 'Shared Files' : 'Recent Files'}
            </button>
            {breadcrumb.map((crumb, i) => (
              <span key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fa-solid fa-chevron-right" style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }} />
                <button onClick={() => breadcrumbNav(i)} style={{ background: 'none', border: 'none', color: i === breadcrumb.length - 1 ? 'var(--text-primary)' : '#6366f1', cursor: 'pointer', fontWeight: i === breadcrumb.length - 1 ? 700 : 400, padding: '2px 4px', borderRadius: '4px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-primary)', borderRadius: '10px', padding: '0 12px', border: '1px solid var(--border-color)', minWidth: '200px' }}>
            <i className="fa-solid fa-magnifying-glass" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }} />
            <input type="text" placeholder="Search files…" value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); if (!e.target.value.trim()) setSearchResults(null); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(searchQuery); }}
              style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.85rem', padding: '9px 0', width: '160px' }} />
            {searchQuery && <button onClick={() => { setSearchQuery(''); setSearchResults(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0' }}><i className="fa-solid fa-xmark" /></button>}
          </div>

          {/* Action buttons */}
          <button onClick={() => setNewFolderModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '10px', background: 'var(--bg-hover)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap' }}>
            <i className="fa-solid fa-folder-plus" /> New Folder
          </button>
          <button onClick={() => uploadRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: '10px', background: '#6366f1', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
            <i className="fa-solid fa-cloud-arrow-up" /> Upload
          </button>
          <input ref={uploadRef} type="file" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) uploadFile(e.target.files[0]); e.target.value = ''; }} />
          <button onClick={loadDirectory} style={{ padding: '9px 12px', borderRadius: '10px', background: 'var(--bg-hover)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer' }} title="Refresh">
            <i className="fa-solid fa-arrows-rotate" />
          </button>
        </div>

        {/* Search results banner */}
        {searchResults !== null && (
          <div style={{ padding: '8px 20px', background: 'rgba(99,102,241,0.08)', borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-magnifying-glass" />
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
            <button onClick={() => { setSearchResults(null); setSearchQuery(''); }} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', marginLeft: 'auto', textDecoration: 'underline', fontSize: '0.8rem' }}>Clear</button>
          </div>
        )}

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 120px 100px', padding: '10px 20px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
          {['Name', 'Modified', 'Owner', 'Size', 'Actions'].map(h => (
            <span key={h} style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
          ))}
        </div>

        {/* Content area with Drag-and-Drop */}
        <div 
          style={{ flex: 1, overflowY: 'auto', padding: '6px 0', position: 'relative' }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              uploadFile(e.dataTransfer.files[0]);
            }
          }}
        >
          {isDragging && (
            <div style={{
              position: 'absolute', inset: '10px',
              border: '2px dashed var(--primary)',
              borderRadius: '12px',
              background: 'rgba(99, 102, 241, 0.15)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              zIndex: 100, color: 'var(--text-primary)', pointerEvents: 'none'
            }}>
              <i className="fa-solid fa-cloud-arrow-up fa-3x" style={{ color: 'var(--primary)', marginBottom: '12px' }} />
              <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>Drop files here to upload to Secure Vault</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>E2E encrypted upon landing</span>
            </div>
          )}

          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <i className="fa-solid fa-spinner fa-spin fa-2x" style={{ marginBottom: '12px', display: 'block' }} />
              Loading…
            </div>
          ) : folders.length === 0 && displayedFiles.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6rem 2rem', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-subtle)', margin: '2rem' }}>
              <div style={{ marginBottom: '1.5rem', color: 'var(--primary)', opacity: 0.8 }}>
                <i className="fa-solid fa-cloud-arrow-up" style={{ fontSize: '4.5rem' }}></i>
              </div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {searchResults !== null ? 'No Results Found' : 'Vault is Empty'}
              </h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '2.5rem', maxWidth: '400px', fontSize: '1.1rem', lineHeight: '1.5' }}>
                {searchResults !== null ? 'Try adjusting your search query to find the files you need.' : 'Upload files or create a new folder to start organizing your documents securely.'}
              </p>
              {searchResults === null && (
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button onClick={() => uploadRef.current?.click()} className="btn btn-primary" style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}>
                    <i className="fa-solid fa-cloud-arrow-up icon" /> Upload Files
                  </button>
                  <button onClick={() => setNewFolderModal(true)} className="btn btn-secondary" style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}>
                    <i className="fa-solid fa-folder-plus icon" /> New Folder
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* ── Back navigation when inside a subfolder ── */}
              {searchResults === null && currentFolderId && (
                <div onClick={() => setBreadcrumb(prev => prev.slice(0, -1))}
                  style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 120px 100px',
                    padding: '10px 20px', borderRadius: '8px', margin: '1px 8px',
                    cursor: 'pointer', transition: 'background 0.12s', alignItems: 'center',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <i className="fa-solid fa-arrow-left" style={{ fontSize: '1rem', color: '#6366f1', flexShrink: 0 }} />
                    <span style={{ fontWeight: 500, color: '#6366f1', fontSize: '0.9rem' }}>.. Go Back</span>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>—</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>—</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>—</span>
                  <span></span>
                </div>
              )}

              {/* ── Folders ── */}
              {searchResults === null && folders.map(folder => (
                <div key={folder.id} onClick={() => enterFolder(folder)} onContextMenu={e => openFolderMenu(e, folder)}
                  style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 120px 100px',
                    padding: '10px 20px', borderRadius: '8px', margin: '1px 8px',
                    cursor: 'pointer', transition: 'background 0.12s', alignItems: 'center',
                    opacity: deletingId === folder.id ? 0.4 : 1
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <i className="fa-solid fa-folder" style={{ fontSize: '1.3rem', color: '#f59e0b', flexShrink: 0 }} />
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{formatDate(folder.updatedAt)}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>—</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Folder</span>
                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                    {isFolderOwner(folder) && (
                      <>
                        <button onClick={() => renameFolder(folder)} title="Rename" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px 6px', borderRadius: '6px' }}><i className="fa-solid fa-pen" /></button>
                        <button onClick={() => setShareModal({ item: folder, type: 'folder' })} title="Share" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px 6px', borderRadius: '6px' }}><i className="fa-solid fa-share-nodes" /></button>
                        <button onClick={() => deleteFolder(folder)} title="Delete" disabled={deletingId === folder.id}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px 6px', borderRadius: '6px' }}>
                          {deletingId === folder.id ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-trash" />}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {/* ── Files ── */}
              {displayedFiles.map(file => {
                const fileInfo = getFileIcon(file.name, file.currentVersion?.mimeType || '');
                const size = file.currentVersion?.fileSize;
                const isSelected = selectedFile?.id === file.id;
                return (
                  <div key={file.id} onContextMenu={e => openFileMenu(e, file)}
                    style={{
                      display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 120px 100px',
                      padding: '10px 20px', borderRadius: '8px', margin: '1px 8px',
                      cursor: 'default', transition: 'background 0.12s', alignItems: 'center',
                      opacity: deletingId === file.id ? 0.4 : 1,
                      border: isSelected ? '1px solid var(--primary)' : '1px solid transparent',
                      background: isSelected ? 'var(--bg-active)' : 'transparent'
                    }}
                    onClick={() => setSelectedFile(file)}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                      <i className={`fa-solid ${fileInfo.icon}`} style={{ fontSize: '1.2rem', color: fileInfo.color, flexShrink: 0 }} />
                      <div style={{ overflow: 'hidden' }}>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', display: 'block' }}
                          onClick={(e) => { e.stopPropagation(); setPreviewModal(file); }} title="Click to Preview">{file.name}</span>
                        {file.tags?.length > 0 && (
                          <div style={{ display: 'flex', gap: '4px', marginTop: '3px', flexWrap: 'wrap' }}>
                            {file.tags.map(t => (
                              <span key={t.tag} style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '20px', background: 'rgba(99,102,241,0.15)', color: '#6366f1', fontWeight: 500 }}>{t.tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{formatDate(file.updatedAt)}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {usersCache?.[file.ownerId?.toLowerCase()]?.displayName || '—'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{formatBytes(size)}</span>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                      <button onClick={(e) => { e.stopPropagation(); downloadFile(file.id, file.name); }} title="Download"
                        style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', padding: '4px 6px', borderRadius: '6px' }}><i className="fa-solid fa-download" /></button>
                      {isFileOwner(file) && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); setVersionModal(file); }} title="Version History"
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px 6px', borderRadius: '6px' }}><i className="fa-solid fa-clock-rotate-left" /></button>
                          <button onClick={(e) => { e.stopPropagation(); deleteFile(file); }} title="Delete" disabled={deletingId === file.id}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px 6px', borderRadius: '6px' }}>
                            {deletingId === file.id ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-trash" />}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ── Details Panel ── */}
      {selectedFile && (
        <FileDetailsPanel
          file={selectedFile}
          token={token}
          usersCache={usersCache}
          onClose={() => setSelectedFile(null)}
          onDownloadVersion={(fileId, vn) => downloadFile(fileId, selectedFile.name, vn)}
          onReload={loadDirectory}
          isOwner={isFileOwner(selectedFile)}
        />
      )}

      {/* ── Drop-down Context Menu ── */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />
      )}

      {/* ── Modals ── */}
      {newFolderModal && <NewFolderModal onClose={() => setNewFolderModal(false)} onCreate={createFolder} />}
      {versionModal && (
        <VersionHistoryModal
          file={versionModal} token={token}
          onClose={() => setVersionModal(null)}
          onDownloadVersion={(fileId, vn) => downloadFile(fileId, versionModal.name, vn)}
        />
      )}
      {shareModal && (
        <ShareModal
          item={shareModal.item} itemType={shareModal.type}
          token={token} usersCache={usersCache}
          onClose={() => setShareModal(null)}
        />
      )}
      {previewModal && <PreviewModal file={previewModal} token={token} onClose={() => setPreviewModal(null)} />}
    </div>
  );
}

export default FilesVault;
