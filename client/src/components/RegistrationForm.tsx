import { useState } from 'react';

interface RegistrationFormProps {
  requestId: string;
  token: string;
  proposedDates: string[];
  onSuccess: () => void;
}

export default function RegistrationForm({ requestId, token, proposedDates, onSuccess }: RegistrationFormProps) {
  const [attendeeName, setAttendeeName] = useState('');
  const [attendeeEmail, setAttendeeEmail] = useState('');
  const [numberOfKids, setNumberOfKids] = useState(1);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function toggleDate(date: string) {
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!attendeeName.trim()) {
      setError('Name is required');
      return;
    }
    if (!attendeeEmail.trim()) {
      setError('Email is required');
      return;
    }
    if (numberOfKids < 1) {
      setError('Number of kids must be at least 1');
      return;
    }
    if (selectedDates.size === 0) {
      setError('Please select at least one date');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/events/${requestId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          attendeeName: attendeeName.trim(),
          attendeeEmail: attendeeEmail.trim(),
          numberOfKids,
          availableDates: Array.from(selectedDates),
        }),
      });

      if (res.status === 409) {
        setError("You've already registered for this event");
        return;
      }
      if (res.status === 401) {
        setError('This registration link is invalid');
        return;
      }
      if (res.status === 422) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Registration is not currently open for this event');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to register');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to register');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ fontSize: '1.3rem', marginBottom: 0 }}>Register</h2>

      <label>
        Your Name
        <input
          value={attendeeName}
          onChange={e => setAttendeeName(e.target.value)}
          required
          style={inputStyle}
          data-testid="attendee-name"
        />
      </label>

      <label>
        Email
        <input
          type="email"
          value={attendeeEmail}
          onChange={e => setAttendeeEmail(e.target.value)}
          required
          style={inputStyle}
          data-testid="attendee-email"
        />
      </label>

      <label>
        Number of Kids
        <input
          type="number"
          min={1}
          value={numberOfKids}
          onChange={e => setNumberOfKids(Number(e.target.value) || 1)}
          required
          style={inputStyle}
          data-testid="number-of-kids"
        />
      </label>

      <fieldset style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
        <legend style={{ fontWeight: 600 }}>Which dates work for you?</legend>
        {proposedDates.map(date => (
          <label key={date} style={{ display: 'block', padding: '4px 0', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selectedDates.has(date)}
              onChange={() => toggleDate(date)}
              data-testid={`date-${date}`}
            />
            {' '}{formatDate(date)}
          </label>
        ))}
      </fieldset>

      <button type="submit" disabled={submitting} style={buttonStyle}>
        {submitting ? 'Registering...' : 'Register'}
      </button>

      {error && <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>{error}</p>}
    </form>
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

const buttonStyle: React.CSSProperties = {
  marginTop: 8,
  padding: '0.6rem 1rem',
  borderRadius: 8,
  border: '1px solid #1d4ed8',
  background: '#2563eb',
  color: '#fff',
  cursor: 'pointer',
};
