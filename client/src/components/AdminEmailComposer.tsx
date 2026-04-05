import { useState } from 'react';

interface AdminEmailComposerProps {
  requestId: string;
  requesterName: string;
  classSlug: string;
  hasThreadAddress: boolean;
  onSent: () => void;
}

export default function AdminEmailComposer({
  requestId,
  classSlug,
  hasThreadAddress,
  onSent,
}: AdminEmailComposerProps) {
  const [expanded, setExpanded] = useState(false);
  const [subject, setSubject] = useState(`Re: Your ${classSlug} event request`);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSend() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/email-requester`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to send email');
        return;
      }
      setExpanded(false);
      setBody('');
      onSent();
    } catch {
      setError('Failed to send email');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong>Email Requester</strong>
        {!expanded && (
          <button
            onClick={() => setExpanded(true)}
            style={btnStyle}
            data-testid="email-requester-btn"
          >
            Email Requester
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          {!hasThreadAddress && (
            <p style={{
              padding: '8px 12px',
              background: '#fef9c3',
              border: '1px solid #fde047',
              borderRadius: 6,
              color: '#854d0e',
              margin: 0,
            }}>
              A thread address must be assigned before emailing the requester.
            </p>
          )}

          <label>
            Subject
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              style={inputStyle}
              data-testid="email-subject-input"
              readOnly={!hasThreadAddress}
            />
          </label>

          <label>
            Body
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
              data-testid="email-body-input"
              readOnly={!hasThreadAddress}
            />
          </label>

          {error && (
            <p style={{ color: '#dc2626', margin: 0 }} data-testid="email-error">{error}</p>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSend}
              disabled={!hasThreadAddress || loading}
              style={{
                ...btnStyle,
                opacity: (!hasThreadAddress || loading) ? 0.5 : 1,
                cursor: (!hasThreadAddress || loading) ? 'not-allowed' : 'pointer',
              }}
              data-testid="email-send-btn"
            >
              {loading ? 'Sending...' : 'Send'}
            </button>
            <button
              onClick={() => { setExpanded(false); setError(''); }}
              style={cancelBtnStyle}
              data-testid="email-cancel-btn"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '0.5rem',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  marginTop: 4,
  boxSizing: 'border-box',
};

const btnStyle: React.CSSProperties = {
  padding: '0.4rem 0.8rem',
  borderRadius: 8,
  border: '1px solid #1d4ed8',
  background: '#2563eb',
  color: '#fff',
  cursor: 'pointer',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '0.4rem 0.8rem',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  color: '#374151',
  cursor: 'pointer',
};
