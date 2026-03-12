import { Link } from 'react-router-dom';

interface ComingSoonProps {
  title: string;
  description: string;
}

export default function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>{title}</h1>
        <p style={styles.description}>{description}</p>
        <div style={styles.badge}>Coming Soon</div>
        <p style={styles.hint}>
          This feature is planned for a future release.
        </p>
        <Link to="/" style={styles.backLink}>
          &larr; Back to Home
        </Link>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 500,
    margin: '60px auto',
    padding: '0 1rem',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  card: {
    textAlign: 'center' as const,
    padding: '2rem',
    border: '1px solid #e0e0e0',
    borderRadius: 12,
    background: '#fafafa',
  },
  title: {
    fontSize: '1.5rem',
    marginTop: 0,
    marginBottom: '0.5rem',
    color: '#1e293b',
  },
  description: {
    color: '#64748b',
    fontSize: '0.95rem',
    lineHeight: 1.5,
    marginBottom: '1.25rem',
  },
  badge: {
    display: 'inline-block',
    padding: '0.35rem 1rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    background: '#e0e7ff',
    color: '#4f46e5',
    borderRadius: 9999,
    marginBottom: '1rem',
  },
  hint: {
    color: '#94a3b8',
    fontSize: '0.85rem',
    marginBottom: '1.25rem',
  },
  backLink: {
    color: '#4f46e5',
    fontSize: '0.9rem',
    textDecoration: 'none',
  },
};
