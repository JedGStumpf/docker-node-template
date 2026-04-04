/**
 * RequesterStatus — Sprint 006
 *
 * Public page accessible at /requests/:id?token=:registrationToken.
 * No login required — access is gated by the registrationToken query param.
 */
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';

interface StatusData {
  id: string;
  status: string;
  classSlug: string;
  classTitle: string;
  confirmedDate: string | null;
  registrationCount: number;
  publicEventUrl: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  unverified: 'Pending Email Verification',
  new: 'Under Review',
  discussing: 'In Discussion',
  dates_proposed: 'Dates Available for Vote',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

const EARLY_STATUSES = new Set(['unverified', 'new', 'discussing']);

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export default function RequesterStatus() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [data, setData] = useState<StatusData | null>(null);

  useEffect(() => {
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const url = `/api/requests/${encodeURIComponent(id)}/status?token=${encodeURIComponent(token)}`;

    fetch(url)
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (json) setData(json as StatusData);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, token]);

  const containerStyle: React.CSSProperties = {
    maxWidth: 520,
    margin: '60px auto',
    padding: '0 24px',
    fontFamily: 'system-ui, sans-serif',
  };

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: 32,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <p style={{ color: '#64748b' }}>Loading your request status…</p>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 12px', color: '#dc2626' }}>Request Not Found</h2>
          <p style={{ color: '#64748b', margin: 0 }}>
            The link you followed may be invalid or has expired. Please check your verification email.
          </p>
        </div>
      </div>
    );
  }

  const statusLabel = STATUS_LABELS[data.status] ?? data.status;
  const isEarly = EARLY_STATUSES.has(data.status);
  const isConfirmed = data.status === 'confirmed';

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, color: '#1e293b' }}>Event Request Status</h1>
        <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: 14 }}>
          Class: <strong>{data.classTitle || data.classSlug}</strong>
        </p>

        <div style={{ marginBottom: 20 }}>
          <span
            style={{
              display: 'inline-block',
              padding: '6px 14px',
              borderRadius: 9999,
              fontSize: 14,
              fontWeight: 600,
              background: isConfirmed ? '#dcfce7' : isEarly ? '#f1f5f9' : '#fef9c3',
              color: isConfirmed ? '#15803d' : isEarly ? '#475569' : '#854d0e',
            }}
          >
            {statusLabel}
          </span>
        </div>

        {isEarly && (
          <p style={{ color: '#64748b', fontSize: 14 }}>
            Your request is being processed. Check back later for updates.
          </p>
        )}

        {data.status === 'dates_proposed' && (
          <p style={{ color: '#64748b', fontSize: 14 }}>
            Dates have been proposed. {data.registrationCount > 0
              ? `${data.registrationCount} participant${data.registrationCount !== 1 ? 's' : ''} have voted.`
              : 'Voting is open.'}
          </p>
        )}

        {isConfirmed && data.confirmedDate && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, color: '#64748b' }}>Confirmed date:</p>
            <p style={{ margin: 0, fontWeight: 600, color: '#1e293b' }}>
              {formatDate(data.confirmedDate)}
            </p>
          </div>
        )}

        {isConfirmed && data.registrationCount > 0 && (
          <p style={{ color: '#64748b', fontSize: 14 }}>
            {data.registrationCount} participant{data.registrationCount !== 1 ? 's' : ''} registered.
          </p>
        )}

        {isConfirmed && data.publicEventUrl && (
          <div style={{ marginTop: 20 }}>
            <Link
              to={data.publicEventUrl}
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                background: '#4f46e5',
                color: '#fff',
                borderRadius: 6,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              View Event &amp; Register
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
