/**
 * Tests for instructor profile API.
 * GET /api/instructor/profile — get own profile
 * PUT /api/instructor/profile — create or update own profile
 */
import request from 'supertest';
import { prisma } from '../../server/src/services/prisma';

process.env.NODE_ENV = 'test';

import app from '../../server/src/app';

async function loginAsInstructor(agent: any, pike13UserId: string, email: string) {
  await agent
    .post('/api/auth/test-login')
    .send({
      pike13UserId,
      email,
      displayName: `Instructor ${pike13UserId}`,
      role: 'instructor',
    })
    .expect(200);
}

describe('Instructor Profile API', () => {
  afterEach(async () => {
    await prisma.instructorProfile.deleteMany({
      where: {
        pike13UserId: { in: ['test-p13-001', 'test-p13-002', 'test-p13-003', 'test-p13-004'] },
      },
    }).catch(() => {});
  });

  describe('GET /api/instructor/profile', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app).get('/api/instructor/profile');
      expect(res.status).toBe(401);
    });

    it('returns 404 when no profile exists for authenticated instructor', async () => {
      const agent = request.agent(app);
      await loginAsInstructor(agent, 'test-p13-001', 'noprofile@example.com');

      const res = await agent.get('/api/instructor/profile');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 200 + profile when profile exists', async () => {
      const agent = request.agent(app);
      await loginAsInstructor(agent, 'test-p13-002', 'hasprofile@example.com');

      // Create profile first
      await agent
        .put('/api/instructor/profile')
        .send({
          topics: ['python-intro'],
          homeZip: '90210',
          maxTravelMinutes: 45,
        })
        .expect(200);

      const res = await agent.get('/api/instructor/profile');
      expect(res.status).toBe(200);
      expect(res.body.pike13UserId).toBe('test-p13-002');
      expect(res.body.topics).toEqual(['python-intro']);
      expect(res.body.homeZip).toBe('90210');
    });
  });

  describe('PUT /api/instructor/profile', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app)
        .put('/api/instructor/profile')
        .send({ topics: ['python-intro'], homeZip: '90210', maxTravelMinutes: 45 });
      expect(res.status).toBe(401);
    });

    it('creates profile when it does not exist', async () => {
      const agent = request.agent(app);
      await loginAsInstructor(agent, 'test-p13-003', 'create@example.com');

      const res = await agent
        .put('/api/instructor/profile')
        .send({
          topics: ['python-intro', 'scratch-basics'],
          homeZip: '90210',
          maxTravelMinutes: 60,
          serviceZips: ['90211', '90212'],
        });

      expect(res.status).toBe(200);
      expect(res.body.pike13UserId).toBe('test-p13-003');
      expect(Array.isArray(res.body.topics)).toBe(true);
      expect(res.body.topics).toEqual(['python-intro', 'scratch-basics']);
      expect(Array.isArray(res.body.serviceZips)).toBe(true);
      expect(res.body.serviceZips).toEqual(['90211', '90212']);

      // Verify in DB
      const profile = await prisma.instructorProfile.findUnique({
        where: { pike13UserId: 'test-p13-003' },
      });
      expect(profile).not.toBeNull();
      expect(Array.isArray(profile!.topics)).toBe(true);
      expect(profile!.topics).toEqual(['python-intro', 'scratch-basics']);
    });

    it('updates existing profile', async () => {
      const agent = request.agent(app);
      await loginAsInstructor(agent, 'test-p13-004', 'update@example.com');

      // Create initial profile
      await agent
        .put('/api/instructor/profile')
        .send({ topics: ['python-intro'], homeZip: '90210', maxTravelMinutes: 30 })
        .expect(200);

      // Update
      const res = await agent
        .put('/api/instructor/profile')
        .send({
          topics: ['python-intro', 'scratch-basics'],
          homeZip: '10001',
          maxTravelMinutes: 60,
        });

      expect(res.status).toBe(200);
      expect(res.body.homeZip).toBe('10001');
      expect(res.body.maxTravelMinutes).toBe(60);
      expect(res.body.topics).toContain('scratch-basics');
    });

    it('returns 422 when topics is empty', async () => {
      const agent = request.agent(app);
      await loginAsInstructor(agent, 'test-p13-003', 'validation1@example.com');

      const res = await agent
        .put('/api/instructor/profile')
        .send({ topics: [], homeZip: '90210', maxTravelMinutes: 45 });

      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 422 when homeZip is not 5 digits', async () => {
      const agent = request.agent(app);
      await loginAsInstructor(agent, 'test-p13-003', 'validation2@example.com');

      const res = await agent
        .put('/api/instructor/profile')
        .send({ topics: ['python-intro'], homeZip: '123', maxTravelMinutes: 45 });

      expect(res.status).toBe(422);
    });

    it('returns 422 when maxTravelMinutes is not positive', async () => {
      const agent = request.agent(app);
      await loginAsInstructor(agent, 'test-p13-003', 'validation3@example.com');

      const res = await agent
        .put('/api/instructor/profile')
        .send({ topics: ['python-intro'], homeZip: '90210', maxTravelMinutes: 0 });

      expect(res.status).toBe(422);
    });

    it('round-trips topics and serviceZips arrays correctly', async () => {
      const agent = request.agent(app);
      await loginAsInstructor(agent, 'test-p13-003', 'roundtrip@example.com');

      const topics = ['python-intro', 'scratch-basics'];
      const serviceZips = ['90210', '90211', '90212'];

      const res = await agent
        .put('/api/instructor/profile')
        .send({ topics, homeZip: '90210', maxTravelMinutes: 60, serviceZips });

      expect(res.status).toBe(200);
      expect(res.body.topics).toEqual(topics);
      expect(res.body.serviceZips).toEqual(serviceZips);

      // Read back via GET
      const getRes = await agent.get('/api/instructor/profile');
      expect(getRes.status).toBe(200);
      expect(getRes.body.topics).toEqual(topics);
      expect(getRes.body.serviceZips).toEqual(serviceZips);
    });
  });
});
