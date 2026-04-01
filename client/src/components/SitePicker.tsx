import { useEffect, useState } from 'react';

export interface SiteOption {
  id: number;
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

interface SitePickerProps {
  value: number | null;
  onChange: (siteId: number | null) => void;
}

export default function SitePicker({ value, onChange }: SitePickerProps) {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/sites')
      .then(async (res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!isMounted) return;
        setSites(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!isMounted) return;
        setSites([]);
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return <p style={{ margin: '0.5rem 0', color: '#64748b' }}>Loading recognized sites...</p>;
  }

  if (sites.length === 0) {
    return <p style={{ margin: '0.5rem 0', color: '#64748b' }}>No recognized sites yet. Enter your location manually.</p>;
  }

  const selected = value == null ? '' : String(value);

  return (
    <div>
      <label htmlFor="site-picker" style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
        Recognized Site
      </label>
      <select
        id="site-picker"
        value={selected}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next ? Number(next) : null);
        }}
        style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: 8 }}
      >
        <option value="">Not listed</option>
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name} - {site.city}, {site.state}
          </option>
        ))}
      </select>
    </div>
  );
}
