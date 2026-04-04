/**
 * AnalyticsDashboard — admin analytics page showing event funnel,
 * instructor utilization, and registration summary.
 * Route: /admin/analytics
 */
import React, { useEffect, useState } from 'react';

interface EventFunnel {
  unverified: number;
  new: number;
  discussing: number;
  dates_proposed: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  total: number;
}

interface InstructorUtilization {
  instructorId: number;
  displayName: string;
  accepted: number;
  declined: number;
  timed_out: number;
  pending: number;
  total: number;
}

interface RegistrationSummary {
  interested: number;
  confirmed: number;
  cancelled: number;
  totalKids: number;
  total: number;
}

interface AnalyticsData {
  period: { from: string; to: string };
  eventFunnel: EventFunnel;
  instructorUtilization: InstructorUtilization[];
  registrations: RegistrationSummary;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function AnalyticsDashboard() {
  const now = new Date();
  const defaultFrom = formatDate(new Date(now.getTime() - 90 * 24 * 3600 * 1000));
  const defaultTo = formatDate(now);

  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?from=${from}&to=${to}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(fromDate, toDate);
  }, []);

  const handleApply = () => fetchAnalytics(fromDate, toDate);

  return (
    <div style={{ padding: '24px', maxWidth: '960px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '24px' }}>Analytics Dashboard</h1>

      {/* Date range picker */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '24px' }}>
        <label>
          From:
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ marginLeft: '8px' }}
            aria-label="from date"
          />
        </label>
        <label>
          To:
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ marginLeft: '8px' }}
            aria-label="to date"
          />
        </label>
        <button onClick={handleApply} disabled={loading}>
          {loading ? 'Loading...' : 'Apply'}
        </button>
      </div>

      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {!data && !loading && <p>No data available.</p>}

      {data && (
        <>
          {/* Event Funnel */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ marginBottom: '12px' }}>Event Funnel</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Status</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>Count</th>
                </tr>
              </thead>
              <tbody>
                {(['unverified', 'new', 'discussing', 'dates_proposed', 'confirmed', 'completed', 'cancelled'] as const).map((status) => (
                  <tr key={status} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px' }}>{status}</td>
                    <td style={{ textAlign: 'right', padding: '8px' }}>
                      {(data.eventFunnel as any)[status] ?? 0}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #e5e7eb', fontWeight: 600 }}>
                  <td style={{ padding: '8px' }}>Total</td>
                  <td style={{ textAlign: 'right', padding: '8px' }}>{data.eventFunnel.total}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Instructor Utilization */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ marginBottom: '12px' }}>Instructor Utilization</h2>
            {data.instructorUtilization.length === 0 ? (
              <p style={{ color: '#6b7280' }}>No assignments in this period.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left', padding: '8px' }}>Instructor</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>Accepted</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>Declined</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>Pending</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.instructorUtilization.map((u) => (
                    <tr key={u.instructorId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px' }}>{u.displayName}</td>
                      <td style={{ textAlign: 'right', padding: '8px' }}>{u.accepted}</td>
                      <td style={{ textAlign: 'right', padding: '8px' }}>{u.declined}</td>
                      <td style={{ textAlign: 'right', padding: '8px' }}>{u.pending}</td>
                      <td style={{ textAlign: 'right', padding: '8px' }}>{u.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Registration Summary */}
          <section>
            <h2 style={{ marginBottom: '12px' }}>Registration Summary</h2>
            <table style={{ width: '300px', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '8px' }}>Interested</td>
                  <td style={{ textAlign: 'right', padding: '8px' }}>{data.registrations.interested}</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px' }}>Confirmed</td>
                  <td style={{ textAlign: 'right', padding: '8px' }}>{data.registrations.confirmed}</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px' }}>Cancelled</td>
                  <td style={{ textAlign: 'right', padding: '8px' }}>{data.registrations.cancelled}</td>
                </tr>
                <tr style={{ borderTop: '2px solid #e5e7eb', fontWeight: 600 }}>
                  <td style={{ padding: '8px' }}>Total Kids (confirmed)</td>
                  <td style={{ textAlign: 'right', padding: '8px' }}>{data.registrations.totalKids}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

export default AnalyticsDashboard;
