/**
 * InstructorDashboard — shows upcoming and past events for the authenticated instructor.
 * Route: /instructor/events
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EquipmentStatusBadge } from '../components/EquipmentStatusBadge';

interface AssignmentSummary {
  id: string;
  requestId: string;
  classSlug: string;
  confirmedDate: string | null;
  location: string | null;
  requestStatus: string;
  assignmentStatus: string;
  equipmentStatus: string;
  equipmentCheckedAt: string | null;
}

interface EventsResponse {
  upcoming: AssignmentSummary[];
  past: AssignmentSummary[];
}

function AssignmentCard({ assignment }: { assignment: AssignmentSummary }) {
  const dateStr = assignment.confirmedDate
    ? new Date(assignment.confirmedDate).toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Date TBD';

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '12px',
        backgroundColor: '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>{assignment.classSlug}</h3>
          <p style={{ margin: '0 0 4px', color: '#6b7280', fontSize: '0.9rem' }}>{dateStr}</p>
          {assignment.location && (
            <p style={{ margin: '0', color: '#6b7280', fontSize: '0.85rem' }}>
              {assignment.location}
            </p>
          )}
        </div>
        <EquipmentStatusBadge status={assignment.equipmentStatus} />
      </div>
    </div>
  );
}

export function InstructorDashboard() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/instructor/events', { credentials: 'include' })
      .then((res) => {
        if (res.status === 401) {
          navigate('/login');
          return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data) setEvents(data);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [navigate]);

  if (loading) return <div style={{ padding: '24px' }}>Loading...</div>;
  if (error) return <div style={{ padding: '24px', color: 'red' }}>Error: {error}</div>;
  if (!events) return null;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      <h1 style={{ marginBottom: '24px' }}>My Events</h1>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ marginBottom: '12px', fontSize: '1.2rem' }}>Upcoming Events</h2>
        {events.upcoming.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No upcoming events.</p>
        ) : (
          events.upcoming.map((a) => <AssignmentCard key={a.id} assignment={a} />)
        )}
      </section>

      <section>
        <h2 style={{ marginBottom: '12px', fontSize: '1.2rem' }}>Past Events</h2>
        {events.past.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No past events in the last 12 months.</p>
        ) : (
          events.past.map((a) => <AssignmentCard key={a.id} assignment={a} />)
        )}
      </section>
    </div>
  );
}

export default InstructorDashboard;
