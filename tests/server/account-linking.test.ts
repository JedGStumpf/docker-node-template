import { findOrCreateOAuthUser } from '../../server/src/routes/auth';
import { prisma } from '../../server/src/services/prisma';
import { cleanupTestDb } from './helpers/db';

beforeAll(async () => {
  await cleanupTestDb();
}, 30000);

afterAll(async () => {
  await cleanupTestDb();
});

describe('Account linking — findOrCreateOAuthUser', () => {
  const sharedEmail = `linking-${Date.now()}@example.com`;

  it('creates a new user on first OAuth login', async () => {
    const user = await findOrCreateOAuthUser(
      'github', 'gh-123', sharedEmail, 'Test User', null,
    );
    expect(user.email).toBe(sharedEmail);
    expect(user.id).toBeDefined();

    // Verify UserProvider record
    const providers = await prisma.userProvider.findMany({
      where: { userId: user.id },
    });
    expect(providers.length).toBe(1);
    expect(providers[0].provider).toBe('github');
    expect(providers[0].providerId).toBe('gh-123');
  });

  it('links a second provider to the same user by email', async () => {
    const user = await findOrCreateOAuthUser(
      'google', 'goog-456', sharedEmail, 'Test User', null,
    );
    expect(user.email).toBe(sharedEmail);

    // Should be the SAME user (same id)
    const firstUser = await prisma.user.findFirst({
      where: { email: sharedEmail },
    });
    expect(firstUser).not.toBeNull();
    expect(user.id).toBe(firstUser!.id);

    // Should now have TWO UserProvider records
    const providers = await prisma.userProvider.findMany({
      where: { userId: user.id },
      orderBy: { provider: 'asc' },
    });
    expect(providers.length).toBe(2);
    expect(providers.map((r: any) => r.provider).sort()).toEqual(['github', 'google']);
  });

  it('links a third provider (pike13) to the same user by email', async () => {
    const user = await findOrCreateOAuthUser(
      'pike13', 'pike-789', sharedEmail, 'Test User', null,
    );
    expect(user.email).toBe(sharedEmail);

    // Should have THREE UserProvider records, still one user
    const providers = await prisma.userProvider.findMany({
      where: { userId: user.id },
      orderBy: { provider: 'asc' },
    });
    expect(providers.length).toBe(3);
    expect(providers.map((r: any) => r.provider).sort()).toEqual(['github', 'google', 'pike13']);

    // Still only one user row for this email
    const userCount = await prisma.user.count({
      where: { email: sharedEmail },
    });
    expect(userCount).toBe(1);
  });

  it('returns existing user when same provider+id logs in again', async () => {
    const user = await findOrCreateOAuthUser(
      'github', 'gh-123', sharedEmail, 'Updated Name', null,
    );
    expect(user.email).toBe(sharedEmail);
    expect(user.displayName).toBe('Updated Name');

    // Still only 3 providers, not 4
    const providers = await prisma.userProvider.findMany({
      where: { userId: user.id },
    });
    expect(providers.length).toBe(3);
  });

  it('creates separate users for different emails', async () => {
    const otherEmail = `other-${Date.now()}@example.com`;
    const user = await findOrCreateOAuthUser(
      'github', 'gh-999', otherEmail, 'Other User', null,
    );
    expect(user.email).toBe(otherEmail);

    // Different user id from the shared email user
    const sharedUser = await prisma.user.findFirst({
      where: { email: sharedEmail },
    });
    expect(user.id).not.toBe(sharedUser!.id);
  });
});
