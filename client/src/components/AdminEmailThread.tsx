import { useEffect, useState } from 'react';

interface AdminEmailThreadProps {
  requestId: string;
  refreshKey?: number;
}

interface EmailQueueEntry {
  id: string;
  subject: string;
  textBody: string;
  status: string;
  createdAt: string;
  type: 'sent';
}

interface EmailExtractionEntry {
  id: string;
  status: string;
  createdAt: string;
  type: 'received';
}

type ThreadEntry = EmailQueueEntry | EmailExtractionEntry;

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, { bg: string; color: string }> = {
    sent: { bg: '#dcfce7', color: '#166534' },
    pending: { bg: '#fef9c3', color: '#854d0e' },
    failed: { bg: '#fee2e2', color: '#991b1b' },
    extracted: { bg: '#dbeafe', color: '#1e40af' },
    processing: { bg: '#f0fdf4', color: '#15803d' },
  };
  const style = colorMap[status] || { bg: '#f1f5f9', color: '#334155' };
  return (
    <span style={{
      background: style.bg,
      color: style.color,
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: '0.8rem',
      fontWeight: 500,
    }}>
      {status}
    </span>
  );
}

export default function AdminEmailThread({ requestId, refreshKey }: AdminEmailThreadProps) {
  const [entries, setEntries] = useState<ThreadEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`/api/admin/requests/${requestId}/email-thread`)
      .then(async res => {
        if (!res.ok) throw new Error('Failed to load thread');
        return res.json();
      })
      .then((data: { sent: Omit<EmailQueueEntry, 'type'>[]; received: Omit<EmailExtractionEntry, 'type'>[] }) => {
        const sent: EmailQueueEntry[] = (data.sent || []).map(e => ({ ...e, type: 'sent' as const }));
        const received: EmailExtractionEntry[] = (data.received || []).map(e => ({ ...e, type: 'received' as const }));
        const merged: ThreadEntry[] = [...sent, ...received].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        setEntries(merged);
      })
      .catch(() => setError('Failed to load email thread'))
      .finally(() => setLoading(false));
  }, [requestId, refreshKey]);

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginTop: 12 }}>
      <strong>Email Thread</strong>

      {loading && <p style={{ color: '#64748b', marginTop: 8 }}>Loading...</p>}
      {error && <p style={{ color: '#dc2626', marginTop: 8 }} data-testid="thread-error">{error}</p>}

      {!loading && !error && entries.length === 0 && (
        <p style={{ color: '#64748b', marginTop: 8 }} data-testid="thread-empty">No thread history yet.</p>
      )}

      {!loading && !error && entries.length > 0 && (
        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
          {entries.map(entry => (
            <div
              key={entry.id}
              style={{
                padding: '10px 12px',
                background: entry.type === 'sent' ? '#f0f9ff' : '#f8fafc',
                border: `1px solid ${entry.type === 'sent' ? '#bae6fd' : '#e2e8f0'}`,
                borderRadius: 6,
              }}
              data-testid={`thread-entry-${entry.type}`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
                  {entry.type === 'sent' ? 'Sent by admin' : 'Received (AI extracted)'}
                </span>
                <StatusBadge status={entry.status} />
              </div>

              {entry.type === 'sent' && (
                <>
                  <p style={{ margin: '4px 0', fontWeight: 500, fontSize: '0.9rem' }}>{(entry as EmailQueueEntry).subject}</p>
                  <p style={{ margin: '4px 0', color: '#4b5563', fontSize: '0.85rem' }}>
                    {(entry as EmailQueueEntry).textBody.slice(0, 200)}
                    {(entry as EmailQueueEntry).textBody.length > 200 ? '…' : ''}
                  </p>
                </>
              )}

              <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.78rem' }}>
                {formatTimestamp(entry.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
