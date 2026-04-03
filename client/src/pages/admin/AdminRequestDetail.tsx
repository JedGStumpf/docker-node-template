import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

interface Registration {
  id: string;
  attendeeName: string;
  attendeeEmail: string;
  numberOfKids: number;
  availableDates: string[];
  status: string;
}

interface RequestDetail {
  id: string;
  requesterName: string;
  requesterEmail: string;
  classSlug: string;
  zipCode: string;
  status: string;
  emailThreadAddress?: string | null;
  asanaTaskId?: string | null;
  site?: { id: number; name: string } | null;
  eventType?: string;
  minHeadcount?: number | null;
  votingDeadline?: string | null;
  confirmedDate?: string | null;
  registrationToken?: string | null;
  proposedDates?: string[];
  assignedInstructorId?: number | null;
  meetupEventUrl?: string | null;
  meetupRsvpCount?: number | null;
  googleCalendarEventId?: string | null;
  eventCapacity?: number | null;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  unverified: ['new'],
  new: ['discussing', 'cancelled'],
  discussing: ['dates_proposed', 'cancelled'],
  dates_proposed: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export default function AdminRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const [requestDetail, setRequestDetail] = useState<RequestDetail | null>(null);
  const [message, setMessage] = useState('');

  // Date proposal form state
  const [proposedDatesInput, setProposedDatesInput] = useState('');
  const [minHeadcountInput, setMinHeadcountInput] = useState('');
  const [votingDeadlineInput, setVotingDeadlineInput] = useState('');

  // Event config state
  const [editMinHeadcount, setEditMinHeadcount] = useState('');
  const [editVotingDeadline, setEditVotingDeadline] = useState('');
  const [editEventType, setEditEventType] = useState('');
  const [editEventCapacity, setEditEventCapacity] = useState('');

  // Registration data
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [voteTallies, setVoteTallies] = useState<Record<string, number>>({});

  // Copy state
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/requests/${id}`)
      .then(async (res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load request'))))
      .then((data) => {
        setRequestDetail(data);
        setEditMinHeadcount(data.minHeadcount != null ? String(data.minHeadcount) : '');
        setEditVotingDeadline(data.votingDeadline ? data.votingDeadline.slice(0, 10) : '');
        setEditEventType(data.eventType || 'private');
        setEditEventCapacity(data.eventCapacity != null ? String(data.eventCapacity) : '');
      })
      .catch(() => setRequestDetail(null));
  }, [id]);

  // Load registrations when in dates_proposed or confirmed
  useEffect(() => {
    if (!id || !requestDetail) return;
    if (requestDetail.status !== 'dates_proposed' && requestDetail.status !== 'confirmed') return;

    fetch(`/api/events/${id}/registrations`)
      .then(async (res) => (res.ok ? res.json() : { registrations: [], voteTallies: {} }))
      .then((data) => {
        setRegistrations(data.registrations || []);
        setVoteTallies(data.voteTallies || {});
      })
      .catch(() => {
        setRegistrations([]);
        setVoteTallies({});
      });
  }, [id, requestDetail?.status]);

  async function transitionTo(newStatus: string, extraData?: Record<string, any>) {
    if (!id) return;
    setMessage('');
    const body: any = { status: newStatus, ...extraData };
    const res = await fetch(`/api/admin/requests/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || 'Failed to update status');
      return;
    }

    const updated = await res.json();
    setRequestDetail(updated);
    setMessage('Status updated');
  }

  async function handleProposeDates() {
    const dates = proposedDatesInput.split(',').map(s => s.trim()).filter(Boolean);
    if (dates.length === 0) {
      setMessage('Please enter at least one date');
      return;
    }
    await transitionTo('dates_proposed', {
      proposedDates: dates,
      minHeadcount: minHeadcountInput ? Number(minHeadcountInput) : undefined,
      votingDeadline: votingDeadlineInput || undefined,
    });
  }

  async function saveEventConfig() {
    if (!id) return;
    setMessage('');
    const res = await fetch(`/api/admin/requests/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        minHeadcount: editMinHeadcount ? Number(editMinHeadcount) : null,
        votingDeadline: editVotingDeadline || null,
        eventType: editEventType,
        eventCapacity: editEventCapacity ? Number(editEventCapacity) : null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || 'Failed to save config');
      return;
    }
    const updated = await res.json();
    setRequestDetail(updated);
    setMessage('Configuration saved');
  }

  async function finalizeDate(date: string) {
    if (!id) return;
    setMessage('');
    const res = await fetch(`/api/admin/requests/${id}/finalize-date`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || 'Failed to finalize date');
      return;
    }
    const updated = await res.json();
    setRequestDetail(updated);
    setMessage('Date finalized');
  }

  function copyRegistrationLink() {
    if (!requestDetail?.registrationToken) return;
    const link = `${window.location.origin}/events/${requestDetail.id}?token=${requestDetail.registrationToken}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!requestDetail) {
    return <p>Loading request...</p>;
  }

  const allowedTransitions = VALID_TRANSITIONS[requestDetail.status] || [];
  const showEventConfig = ['discussing', 'dates_proposed', 'confirmed', 'completed'].includes(requestDetail.status);
  const showRegistrations = requestDetail.status === 'dates_proposed' || requestDetail.status === 'confirmed';
  const proposedDates: string[] = requestDetail.proposedDates || [];

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <h1 style={{ marginBottom: 4 }}>Request Detail</h1>
      <p><strong>Requester:</strong> {requestDetail.requesterName} ({requestDetail.requesterEmail})</p>
      <p><strong>Class:</strong> {requestDetail.classSlug}</p>
      <p><strong>ZIP:</strong> {requestDetail.zipCode}</p>
      <p><strong>Status:</strong> {requestDetail.status}</p>
      <p><strong>Site:</strong> {requestDetail.site?.name || 'Unassigned'}</p>
      <p><strong>Email Thread:</strong> {requestDetail.emailThreadAddress || 'Not available'}</p>
      <p><strong>Asana Task:</strong> {requestDetail.asanaTaskId || 'Not linked'}</p>

      {/* Integration indicators */}
      {requestDetail.meetupEventUrl && (
        <p data-testid="meetup-link">
          <strong>Meetup:</strong>{' '}
          <a href={requestDetail.meetupEventUrl} target="_blank" rel="noopener noreferrer">
            View on Meetup
          </a>
          {requestDetail.meetupRsvpCount != null && (
            <span style={{ marginLeft: 8, background: '#dbeafe', padding: '2px 8px', borderRadius: 12, fontSize: '0.85rem' }}>
              {requestDetail.meetupRsvpCount} RSVPs
            </span>
          )}
        </p>
      )}
      {requestDetail.googleCalendarEventId && (
        <p data-testid="calendar-indicator">
          <strong>Calendar:</strong>{' '}
          <span style={{ color: '#16a34a' }}>✓ Synced to Google Calendar</span>
        </p>
      )}

      {/* Status transition buttons */}
      {allowedTransitions.length > 0 && (
        <div data-testid="status-transitions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {allowedTransitions.map((target) =>
            target === 'dates_proposed' ? null : (
              <button key={target} onClick={() => transitionTo(target)} style={btnStyle}>
                {statusLabel(target)}
              </button>
            ),
          )}
        </div>
      )}

      {/* Date proposal form — shown when discussing */}
      {requestDetail.status === 'discussing' && (
        <fieldset style={fieldsetStyle}>
          <legend style={{ fontWeight: 600 }}>Propose Dates</legend>
          <label>
            Dates (comma-separated, e.g. 2026-06-15, 2026-06-22)
            <input
              value={proposedDatesInput}
              onChange={e => setProposedDatesInput(e.target.value)}
              style={inputStyle}
              data-testid="proposed-dates-input"
            />
          </label>
          <label>
            Min Headcount (optional)
            <input
              type="number"
              value={minHeadcountInput}
              onChange={e => setMinHeadcountInput(e.target.value)}
              style={inputStyle}
              data-testid="min-headcount-input"
            />
          </label>
          <label>
            Voting Deadline (optional)
            <input
              type="date"
              value={votingDeadlineInput}
              onChange={e => setVotingDeadlineInput(e.target.value)}
              style={inputStyle}
              data-testid="voting-deadline-input"
            />
          </label>
          <button onClick={handleProposeDates} style={btnStyle}>Propose Dates</button>
        </fieldset>
      )}

      {/* Shareable registration link */}
      {requestDetail.registrationToken && (
        <div style={{ padding: '8px 12px', background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
          <strong>Registration Link:</strong>{' '}
          <code data-testid="registration-link" style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>
            {`${window.location.origin}/events/${requestDetail.id}?token=${requestDetail.registrationToken}`}
          </code>{' '}
          <button onClick={copyRegistrationLink} style={{ marginLeft: 8 }}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}

      {/* Event configuration panel */}
      {showEventConfig && (
        <fieldset style={fieldsetStyle} data-testid="event-config">
          <legend style={{ fontWeight: 600 }}>Event Configuration</legend>
          <label>
            Event Type
            <select value={editEventType} onChange={e => setEditEventType(e.target.value)} style={inputStyle}>
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </label>
          <label>
            Min Headcount
            <input
              type="number"
              value={editMinHeadcount}
              onChange={e => setEditMinHeadcount(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label>
            Voting Deadline
            <input
              type="date"
              value={editVotingDeadline}
              onChange={e => setEditVotingDeadline(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label>
            Event Capacity (blank = unlimited)
            <input
              type="number"
              value={editEventCapacity}
              onChange={e => setEditEventCapacity(e.target.value)}
              style={inputStyle}
              data-testid="event-capacity-input"
              min="1"
              placeholder="No limit"
            />
          </label>
          <button onClick={saveEventConfig} style={btnStyle}>Save Configuration</button>
        </fieldset>
      )}

      {/* Registration summary */}
      {showRegistrations && (
        <div data-testid="registration-summary">
          <h2 style={{ fontSize: '1.2rem' }}>Registrations ({registrations.length})</h2>

          {/* Vote tallies */}
          {proposedDates.length > 0 && (
            <div style={{ display: 'grid', gap: 4, marginBottom: 12 }}>
              {proposedDates.map(date => (
                <div key={date} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <span>{date}</span>
                  <span>{voteTallies[date] || 0} kids</span>
                </div>
              ))}
            </div>
          )}

          {registrations.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Email</th>
                  <th style={th}>Kids</th>
                  <th style={th}>Dates</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {registrations.map(reg => (
                  <tr key={reg.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={td}>{reg.attendeeName}</td>
                    <td style={td}>{reg.attendeeEmail}</td>
                    <td style={td}>{reg.numberOfKids}</td>
                    <td style={td}>{reg.availableDates.join(', ')}</td>
                    <td style={td}>
                      {reg.status === 'waitlisted' ? (
                        <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 12, fontSize: '0.85rem' }}>
                          Waitlisted
                        </span>
                      ) : reg.status === 'cancelled' ? (
                        <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 12, fontSize: '0.85rem' }}>
                          Cancelled
                        </span>
                      ) : (
                        <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 12, fontSize: '0.85rem' }}>
                          Registered
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No registrations yet.</p>
          )}

          {/* Manual finalize buttons */}
          {requestDetail.status === 'dates_proposed' && proposedDates.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>Finalize Date</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {proposedDates.map(date => (
                  <button key={date} onClick={() => finalizeDate(date)} style={btnStyle} data-testid={`finalize-${date}`}>
                    Finalize {date}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {message ? <p data-testid="status-message">{message}</p> : null}
    </div>
  );
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    new: 'New',
    discussing: 'Start Discussing',
    dates_proposed: 'Propose Dates',
    confirmed: 'Confirm',
    completed: 'Complete',
    cancelled: 'Cancel',
  };
  return labels[status] || status;
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

const fieldsetStyle: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: 12,
  display: 'grid',
  gap: 8,
};

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.5rem',
  borderBottom: '1px solid #cbd5e1',
};

const td: React.CSSProperties = {
  padding: '0.5rem',
};
