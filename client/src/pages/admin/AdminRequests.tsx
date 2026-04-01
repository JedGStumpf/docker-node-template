import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type StatusTab = 'all' | 'new' | 'discussing' | 'scheduled' | 'cancelled';

interface RequestRow {
  id: string;
  classSlug: string;
  requesterName: string;
  requesterEmail: string;
  status: string;
  createdAt: string;
  emailThreadAddress: string | null;
  asanaTaskId: string | null;
}

const LIMIT = 20;

export default function AdminRequests() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusTab>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(LIMIT));
    if (status !== 'all') params.set('status', status);
    if (search) params.set('search', search);

    fetch(`/api/admin/requests?${params.toString()}`)
      .then(async (res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load requests'))))
      .then((data) => {
        setRequests(Array.isArray(data.requests) ? data.requests : []);
        setTotal(typeof data.total === 'number' ? data.total : 0);
      })
      .catch(() => {
        setRequests([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [status, search, page]);

  const maxPage = useMemo(() => Math.max(1, Math.ceil(total / LIMIT)), [total]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Admin Requests</h1>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['all', 'new', 'discussing', 'scheduled', 'cancelled'] as StatusTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setStatus(tab);
              setPage(1);
            }}
            style={{
              padding: '0.4rem 0.7rem',
              borderRadius: 999,
              border: '1px solid #cbd5e1',
              background: status === tab ? '#0f172a' : '#fff',
              color: status === tab ? '#fff' : '#111827',
            }}
          >
            {tab === 'all' ? 'All' : tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <input
        aria-label="Search requests"
        placeholder="Search requester name or email"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        style={{ maxWidth: 420, padding: '0.5rem', borderRadius: 8, border: '1px solid #cbd5e1' }}
      />

      {loading ? <p>Loading...</p> : null}

      {!loading && requests.length === 0 ? <p>No requests found.</p> : null}

      {!loading && requests.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Requester</th>
              <th style={th}>Class</th>
              <th style={th}>Status</th>
              <th style={th}>Thread</th>
              <th style={th}>Asana</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr
                key={r.id}
                onClick={() => navigate(`/admin/requests/${r.id}`)}
                style={{ cursor: 'pointer', borderTop: '1px solid #e2e8f0' }}
              >
                <td style={td}>{r.requesterName}<br /><small>{r.requesterEmail}</small></td>
                <td style={td}>{r.classSlug}</td>
                <td style={td}>{r.status}</td>
                <td style={td}>{r.emailThreadAddress || 'N/A'}</td>
                <td style={td}>{r.asanaTaskId || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Previous</button>
        <span>Page {page} of {maxPage}</span>
        <button onClick={() => setPage((p) => Math.min(maxPage, p + 1))} disabled={page >= maxPage}>Next</button>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.5rem',
  borderBottom: '1px solid #cbd5e1',
};

const td: React.CSSProperties = {
  padding: '0.5rem',
};
