import { useAuth } from '../context/AuthContext';
import { roleBadgeStyle, roleShortLabel } from '../lib/roles';

export default function Account() {
  const { user } = useAuth();
  if (!user) return null;

  const displayName = user.displayName ?? 'User';
  const badge = roleBadgeStyle(user.role);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Account</h1>

      <div style={styles.card}>
        <div style={styles.avatarRow}>
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={displayName} style={styles.avatar} />
          ) : (
            <div style={styles.avatarFallback}>
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div style={styles.name}>{displayName}</div>
            <div style={styles.email}>{user.email}</div>
          </div>
        </div>

        <div style={styles.fields}>
          <Field label="Role">
            <span style={{
              fontSize: 12,
              padding: '2px 8px',
              borderRadius: 9999,
              fontWeight: 600,
              background: badge.background,
              color: badge.color,
            }}>
              {roleShortLabel(user.role)}
            </span>
          </Field>
          {user.provider && <Field label="Auth provider">{user.provider}</Field>}
          <Field label="Member since">
            {new Date(user.createdAt).toLocaleDateString()}
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <span style={styles.fieldValue}>{children}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 600,
    margin: '40px auto',
    padding: '0 1rem',
  },
  title: {
    fontSize: '1.5rem',
    marginBottom: '1.5rem',
    color: '#1e293b',
  },
  card: {
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: '1.5rem',
    background: '#fff',
  },
  avatarRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: '1.5rem',
    paddingBottom: '1.5rem',
    borderBottom: '1px solid #e2e8f0',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    objectFit: 'cover' as const,
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: '#4f46e5',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
    fontWeight: 600,
    flexShrink: 0,
  },
  name: {
    fontSize: '1.15rem',
    fontWeight: 600,
    color: '#1e293b',
  },
  email: {
    fontSize: '0.9rem',
    color: '#64748b',
    marginTop: 2,
  },
  fields: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  field: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: '0.9rem',
    color: '#64748b',
  },
  fieldValue: {
    fontSize: '0.9rem',
    color: '#1e293b',
    fontWeight: 500,
  },
};
