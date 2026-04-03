import { useEffect, useState } from 'react';

interface QueueEntry {
  id: string;
  recipient: string;
  subject: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

const STATUS_TABS = ['all', 'pending', 'failed', 'dead', 'sent'] as const;

export default function EmailQueueAdmin() {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const limit = 20;

  useEffect(() => {
    loadEntries();
  }, [status, page]);

  async function loadEntries() {
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    params.set('page', String(page));
    params.set('limit', String(limit));

    try {
      const res = await fetch(`/api/admin/email-queue?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setEntries(data.rows || []);
      setTotal(data.total || 0);
    } catch {
      setEntries([]);
      setTotal(0);
    }
  }

  async function retryEmail(id: string) {
    setMessage('');
    try {
      const res = await fetch(`/api/admin/email-queue/${id}/retry`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error || 'Failed to retry');
        return;
      }
      setMessage('Email reset to pending');
      loadEntries();
    } catch {
      setMessage('Failed to retry');
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h1 style={{ marginBottom: 4 }}>Email Queue</h1>

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: 4 }} data-testid="status-tabs">
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => { setStatus(tab); setPage(1); }}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: status === tab ? '#2563eb' : '#fff',
              color: status === tab ? '#fff' : '#333',
              cursor: 'pointer',
              fontWeight: status === tab ? 600 : 400,
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Recipient</th>
            <th style={th}>Subject</th>
            <th style={th}>Status</th>
            <th style={th}>Attempts</th>
            <th style={th}>Error</th>
            <th style={th}>Created</th>
            <th style={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr><td colSpan={7} style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8' }}>No entries</td></tr>
          ) : entries.map(entry => (
            <tr key={entry.id} style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={td}>{entry.recipient}</td>
              <td style={td}>{entry.subject}</td>
              <td style={td}>
                <span style={statusBadge(entry.status)}>{entry.status}</span>
              </td>
              <td style={td}>{entry.attempts}</td>
              <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.lastError || '—'}
              </td>
              <td style={td}>{new Date(entry.createdAt).toLocaleString()}</td>
              <td style={td}>
                {entry.status === 'dead' && (
                  <button onClick={() => retryEmail(entry.id)} style={retryBtn} data-testid={`retry-${entry.id}`}>
                    Retry
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} data-testid="pagination">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #cbd5e1', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
          >
            Prev
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #cbd5e1', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
          >
            Next
          </button>
        </div>
      )}

      {message && <p data-testid="queue-message">{message}</p>}
    </div>
  );
}

function statusBadge(status: string): React.CSSProperties {
  const colors: Record<string, { bg: string; fg: string }> = {
    pending: { bg: '#dbeafe', fg: '#1e40af' },
    sent: { bg: '#dcfce7', fg: '#166534' },
    failed: { bg: '#fef3c7', fg: '#92400e' },
    dead: { bg: '#fee2e2', fg: '#991b1b' },
  };
  const c = colors[status] || { bg: '#f1f5f9', fg: '#334155' };
  return { background: c.bg, color: c.fg, padding: '2px 8px', borderRadius: 12, fontSize: '0.85rem' };
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.5rem',
  borderBottom: '1px solid #cbd5e1',
};

const td: React.CSSProperties = {
  padding: '0.5rem',
};

const retryBtn: React.CSSProperties = {
  padding: '2px 10px',
  borderRadius: 6,
  border: '1px solid #f97316',
  background: '#fff7ed',
  color: '#c2410c',
  cursor: 'pointer',
  fontSize: '0.85rem',
};
