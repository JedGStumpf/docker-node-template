/**
 * Tests for Pike13 OAuth login, session management, and auth middleware.
 * Uses test-login endpoint — no real Pike13 OAuth calls.
 */
import request from 'supertest';

process.env.NODE_ENV = 'test';

import app from '../../server/src/app';

describe('Pike13 Auth — test-login with pike13UserId', () => {
  it('POST /api/auth/test-login with pike13UserId creates a pike13 session', async () => {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/test-login')
      .send({
        pike13UserId: 'p13-instructor-001',
        email: 'instructor@example.com',
        displayName: 'Test Instructor',
        role: 'instructor',
      });

    expect(res.status).toBe(200);
    expect(res.body.pike13UserId).toBe('p13-instructor-001');
    expect(res.body.pike13Role).toBe('instructor');
  });

  it('POST /api/auth/test-login with admin role creates admin session', async () => {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/test-login')
      .send({
        pike13UserId: 'p13-admin-001',
        email: 'admin@example.com',
        displayName: 'Test Admin',
        role: 'admin',
      });

    expect(res.status).toBe(200);
    expect(res.body.pike13Role).toBe('admin');
  });

  it('Pike13 session persists across requests when using agent', async () => {
    const agent = request.agent(app);

    // Login
    await agent
      .post('/api/auth/test-login')
      .send({
        pike13UserId: 'p13-session-test',
        email: 'session@example.com',
        displayName: 'Session Test',
        role: 'instructor',
      })
      .expect(200);

    // The session should persist — a protected route should return 200 not 401
    // We test this by checking a protected endpoint after login
    // (instructor profile route requires instructor session)
    const profileRes = await agent.get('/api/instructor/profile');
    // We expect either 200 (profile exists) or 404 (no profile yet),
    // but NOT 401 (which would mean session didn't persist)
    expect([200, 404]).toContain(profileRes.status);
    expect(profileRes.status).not.toBe(401);
  });
});

describe('Pike13 Auth — standard test-login (no pike13UserId)', () => {
  it('POST /api/auth/test-login without pike13UserId creates DB user session', async () => {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/test-login')
      .send({
        email: 'dbuser@example.com',
        displayName: 'DB User',
        role: 'USER',
      });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('dbuser@example.com');
    expect(res.body.id).toBeDefined();
  });
});

describe('Pike13 Auth — requireInstructor middleware', () => {
  it('returns 401 on instructor-protected route without session', async () => {
    const res = await request(app).get('/api/instructor/profile');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('allows access to instructor route after pike13 login', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/test-login')
      .send({
        pike13UserId: 'p13-perm-test',
        email: 'permtest@example.com',
        displayName: 'Perm Test',
        role: 'instructor',
      })
      .expect(200);

    const res = await agent.get('/api/instructor/profile');
    // 200 (profile found) or 404 (no profile yet) are both acceptable
    expect([200, 404]).toContain(res.status);
  });
});

describe('Pike13 Auth — requirePike13Admin middleware', () => {
  it('returns 401 on admin-only route without session', async () => {
    const res = await request(app).get('/api/admin/requests');
    expect(res.status).toBe(401);
  });

  it('returns 403 on admin-only route with instructor session', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/test-login')
      .send({
        pike13UserId: 'p13-instructor-forbidden',
        email: 'forbidden@example.com',
        displayName: 'Forbidden Instructor',
        role: 'instructor',
      })
      .expect(200);

    const res = await agent.get('/api/admin/requests');
    expect(res.status).toBe(403);
  });

  it('allows access to admin route with admin session', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/test-login')
      .send({
        pike13UserId: 'p13-admin-access',
        email: 'adminaccess@example.com',
        displayName: 'Admin Access Test',
        role: 'admin',
      })
      .expect(200);

    const res = await agent.get('/api/admin/requests');
    // 200 is the expected success response
    expect(res.status).toBe(200);
  });
});

describe('Pike13 Auth — logout', () => {
  it('POST /api/auth/logout destroys session and returns 200', async () => {
    const agent = request.agent(app);

    // Login first
    await agent
      .post('/api/auth/test-login')
      .send({
        pike13UserId: 'p13-logout-test',
        email: 'logouttest@example.com',
        displayName: 'Logout Test',
        role: 'instructor',
      })
      .expect(200);

    // Logout
    const logoutRes = await agent.post('/api/auth/logout');
    expect(logoutRes.status).toBe(200);

    // After logout, protected routes should return 401
    const profileRes = await agent.get('/api/instructor/profile');
    expect(profileRes.status).toBe(401);
  });
});

describe('Pike13 OAuth routes — unconfigured', () => {
  it('GET /api/auth/pike13 returns 501 when not configured', async () => {
    // No PIKE13_CLIENT_ID set in test env
    const res = await request(app).get('/api/auth/pike13');
    expect(res.status).toBe(501);
  });
});
