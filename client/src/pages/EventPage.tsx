import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import RegistrationForm from '../components/RegistrationForm';

interface EventInfo {
  id: string;
  classSlug: string;
  status: string;
  proposedDates: string[];
  confirmedDate: string | null;
  locationFreeText: string | null;
  eventType: string;
  minHeadcount: number | null;
  votingDeadline: string | null;
  voteTallies: Record<string, number>;
  registrationCount: number;
  giveLivelyUrl: string | null;
}

type PageState = 'loading' | 'loaded' | 'registered' | 'error';

export default function EventPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [state, setState] = useState<PageState>('loading');
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!requestId || !token) {
      setState('error');
      setError('This registration link is invalid');
      return;
    }

    fetch(`/api/events/${requestId}?token=${encodeURIComponent(token)}`)
      .then(async res => {
        if (res.status === 401) {
          throw new Error('This registration link is invalid');
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to load event');
        }
        return res.json();
      })
      .then(data => {
        setEvent(data);
        setState('loaded');
      })
      .catch(err => {
        setError(err.message);
        setState('error');
      });
  }, [requestId, token]);

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  if (state === 'loading') {
    return (
      <div style={styles.container}>
        <p style={{ color: '#64748b' }}>Loading event details...</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div style={styles.container}>
        <div style={styles.errorBox} role="alert">
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Unable to load event</h2>
          <p style={{ margin: '8px 0 0' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!event) return null;

  const isOpen = event.status === 'dates_proposed';

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>{event.classSlug}</h1>
        {event.locationFreeText && (
          <p style={styles.subtitle}>Location: {event.locationFreeText}</p>
        )}
      </header>

      {event.status === 'confirmed' && event.confirmedDate && (
        <div style={styles.confirmedBox}>
          <strong>Date confirmed:</strong> {formatDate(event.confirmedDate.slice(0, 10))}
        </div>
      )}

      {event.giveLivelyUrl && (
        <div style={styles.donationBox}>
          <strong>Support this event:</strong>{' '}
          <a href={event.giveLivelyUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8' }}>
            Donate via Give Lively
          </a>
        </div>
      )}

      {isOpen && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Proposed Dates</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {event.proposedDates.map(date => (
              <div key={date} style={styles.dateRow}>
                <span>{formatDate(date)}</span>
                <span style={styles.tally}>{event.voteTallies[date] || 0} kids registered</span>
              </div>
            ))}
          </div>
          {event.votingDeadline && (
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 8 }}>
              Registration deadline: {formatDate(event.votingDeadline.slice(0, 10))}
            </p>
          )}
        </section>
      )}

      {state === 'registered' ? (
        <div style={styles.successBox}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>You're registered!</h2>
          <p style={{ margin: '8px 0 0' }}>We'll let you know when the date is finalized.</p>
        </div>
      ) : isOpen ? (
        <section style={styles.section}>
          <RegistrationForm
            requestId={requestId!}
            token={token}
            proposedDates={event.proposedDates}
            onSuccess={() => setState('registered')}
          />
        </section>
      ) : (
        <div style={styles.errorBox} role="alert">
          <p style={{ margin: 0 }}>Registration is not currently open for this event.</p>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 700,
    margin: '40px auto',
    padding: '0 1rem',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.8rem',
    marginBottom: 4,
    color: '#1e293b',
  },
  subtitle: {
    color: '#64748b',
    marginTop: 4,
  },
  section: {
    marginBottom: '1.5rem',
  },
  sectionTitle: {
    fontSize: '1.2rem',
    marginBottom: 8,
    color: '#374151',
  },
  dateRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: '#f8fafc',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
  },
  tally: {
    color: '#6b7280',
    fontSize: '0.9rem',
  },
  successBox: {
    padding: '1rem 1.5rem',
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 8,
  },
  confirmedBox: {
    padding: '1rem 1.5rem',
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 8,
    marginBottom: '1.5rem',
  },
  errorBox: {
    padding: '1rem 1.5rem',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    color: '#991b1b',
  },
  donationBox: {
    padding: '0.75rem 1.5rem',
    background: '#fefce8',
    border: '1px solid #fde68a',
    borderRadius: 8,
    marginBottom: '1.5rem',
  },
};
