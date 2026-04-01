import { useState } from 'react';
import SitePicker from '../components/SitePicker';

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

export default function RequestIntake() {
  const [classSlug, setClassSlug] = useState('python-intro');
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [groupType, setGroupType] = useState('school');
  const [expectedHeadcount, setExpectedHeadcount] = useState(20);
  const [zipCode, setZipCode] = useState('');
  const [preferredDates, setPreferredDates] = useState('2026-06-01');
  const [locationFreeText, setLocationFreeText] = useState('');
  const [registeredSiteId, setRegisteredSiteId] = useState<number | null>(null);
  const [state, setState] = useState<SubmitState>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState('submitting');
    setError('');

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classSlug,
          requesterName,
          requesterEmail,
          groupType,
          expectedHeadcount,
          zipCode,
          preferredDates: preferredDates.split(',').map((s) => s.trim()).filter(Boolean),
          locationFreeText: registeredSiteId ? undefined : locationFreeText,
          registeredSiteId: registeredSiteId ?? undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit request');
      }

      setState('success');
    } catch (err: any) {
      setState('error');
      setError(err.message || 'Failed to submit request');
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.8rem', marginBottom: 8 }}>Request an Event</h1>
      <p style={{ color: '#64748b', marginTop: 0 }}>Submit your event request and we will match you with an instructor.</p>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
        <label>
          Class Slug
          <input value={classSlug} onChange={(e) => setClassSlug(e.target.value)} style={inputStyle} />
        </label>

        <label>
          Requester Name
          <input value={requesterName} onChange={(e) => setRequesterName(e.target.value)} style={inputStyle} />
        </label>

        <label>
          Requester Email
          <input value={requesterEmail} onChange={(e) => setRequesterEmail(e.target.value)} style={inputStyle} />
        </label>

        <label>
          Group Type
          <input value={groupType} onChange={(e) => setGroupType(e.target.value)} style={inputStyle} />
        </label>

        <label>
          Expected Headcount
          <input
            type="number"
            value={expectedHeadcount}
            onChange={(e) => setExpectedHeadcount(Number(e.target.value) || 0)}
            style={inputStyle}
          />
        </label>

        <label>
          ZIP Code
          <input value={zipCode} onChange={(e) => setZipCode(e.target.value)} style={inputStyle} />
        </label>

        <label>
          Preferred Dates (comma-separated)
          <input value={preferredDates} onChange={(e) => setPreferredDates(e.target.value)} style={inputStyle} />
        </label>

        <SitePicker value={registeredSiteId} onChange={setRegisteredSiteId} />

        {!registeredSiteId && (
          <label>
            Location (if site not listed)
            <input value={locationFreeText} onChange={(e) => setLocationFreeText(e.target.value)} style={inputStyle} />
          </label>
        )}

        <button type="submit" disabled={state === 'submitting'} style={buttonStyle}>
          {state === 'submitting' ? 'Submitting...' : 'Submit Request'}
        </button>

        {state === 'success' && <p style={{ color: '#166534' }}>Request submitted. Please check your email to verify.</p>}
        {state === 'error' && <p style={{ color: '#b91c1c' }}>{error}</p>}
      </form>
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
};

const buttonStyle: React.CSSProperties = {
  marginTop: 8,
  padding: '0.6rem 1rem',
  borderRadius: 8,
  border: '1px solid #1d4ed8',
  background: '#2563eb',
  color: '#fff',
};
