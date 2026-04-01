import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

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
}

export default function AdminRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const [requestDetail, setRequestDetail] = useState<RequestDetail | null>(null);
  const [nextStatus, setNextStatus] = useState('new');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/requests/${id}`)
      .then(async (res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load request'))))
      .then((data) => {
        setRequestDetail(data);
        setNextStatus(data.status || 'new');
      })
      .catch(() => setRequestDetail(null));
  }, [id]);

  async function updateStatus() {
    if (!id) return;
    setMessage('');
    const res = await fetch(`/api/admin/requests/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });

    if (!res.ok) {
      setMessage('Failed to update status');
      return;
    }

    const updated = await res.json();
    setRequestDetail(updated);
    setNextStatus(updated.status || nextStatus);
    setMessage('Status updated');
  }

  if (!requestDetail) {
    return <p>Loading request...</p>;
  }

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

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
          <option value="new">New</option>
          <option value="discussing">Discussing</option>
          <option value="scheduled">Scheduled</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button onClick={updateStatus}>Update Status</button>
      </div>

      {message ? <p>{message}</p> : null}
    </div>
  );
}
