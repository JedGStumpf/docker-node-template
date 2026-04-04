/**
 * Route tests for GET /api/instructor/events
 */
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../server/src/services/prisma';

process.env.NODE_ENV = 'test';
import app from '../../server/src/app';

let instructor: any;
let eventReqUpcoming: any;
let eventReqPast: any;
let assignmentUpcoming: any;
let assignmentPast: any;

const futureDate = new Date(Date.now() + 30 * 24 * 3600000); // 30 days from now
const pastDate = new Date(Date.now() - 30 * 24 * 3600000);   // 30 days ago

beforeAll(async () => {
  instructor = await prisma.instructorProfile.create({
    data: {
      pike13UserId: 'events-route-instructor',
      displayName: 'Events Route Instructor',
      email: 'events-route@example.com',
      topics: ['python-intro'],
      homeZip: '90210',
      maxTravelMinutes: 60,
    },
  });

  eventReqUpcoming = await prisma.eventRequest.create({
    data: {
      classSlug: 'python-intro',
      requesterName: 'Events Upcoming Req',
      requesterEmail: 'events-upcoming@example.com',
      groupType: 'school',
      expectedHeadcount: 20,
      zipCode: '90210',
      preferredDates: [],
      verificationToken: `events-upcoming-${Date.now()}`,
      verificationExpiresAt: new Date(Date.now() + 86400000),
      status: 'confirmed',
      confirmedDate: futureDate,
    },
  });

  eventReqPast = await prisma.eventRequest.create({
    data: {
      classSlug: 'scratch-basics',
      requesterName: 'Events Past Req',
      requesterEmail: 'events-past@example.com',
      groupType: 'school',
      expectedHeadcount: 15,
      zipCode: '90210',
      preferredDates: [],
      verificationToken: `events-past-${Date.now()}`,
      verificationExpiresAt: new Date(Date.now() + 86400000),
      status: 'completed',
      confirmedDate: pastDate,
    },
  });

  assignmentUpcoming = await prisma.instructorAssignment.create({
    data: {
      requestId: eventReqUpcoming.id,
      instructorId: instructor.id,
      status: 'accepted',
      notificationToken: `events-upcoming-notif-${Date.now()}`,
      notifiedAt: new Date(),
      equipmentStatus: 'ready',
    },
  });

  assignmentPast = await prisma.instructorAssignment.create({
    data: {
      requestId: eventReqPast.id,
      instructorId: instructor.id,
      status: 'accepted',
      notificationToken: `events-past-notif-${Date.now()}`,
      notifiedAt: new Date(),
      equipmentStatus: 'unknown',
    },
  });
});

afterAll(async () => {
  await prisma.instructorAssignment.deleteMany({
    where: { id: { in: [assignmentUpcoming.id, assignmentPast.id] } },
  });
  await prisma.eventRequest.deleteMany({
    where: { id: { in: [eventReqUpcoming.id, eventReqPast.id] } },
  });
  await prisma.instructorProfile.deleteMany({ where: { pike13UserId: 'events-route-instructor' } });
});

async function loginAsInstructor() {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/test-login')
    .send({
      pike13UserId: 'events-route-instructor',
      role: 'instructor',
      displayName: 'Events Route Instructor',
    })
    .expect(200);
  return agent;
}

describe('GET /api/instructor/events', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/instructor/events');
    expect(res.status).toBe(401);
  });

  it('returns upcoming and past assignments for authenticated instructor', async () => {
    const agent = await loginAsInstructor();
    const res = await agent.get('/api/instructor/events');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('upcoming');
    expect(res.body).toHaveProperty('past');
    expect(Array.isArray(res.body.upcoming)).toBe(true);
    expect(Array.isArray(res.body.past)).toBe(true);
  });

  it('upcoming assignment has correct equipment status', async () => {
    const agent = await loginAsInstructor();
    const res = await agent.get('/api/instructor/events');

    const upcomingAssignment = res.body.upcoming.find((a: any) => a.id === assignmentUpcoming.id);
    expect(upcomingAssignment).toBeDefined();
    expect(upcomingAssignment.equipmentStatus).toBe('ready');
    expect(upcomingAssignment.classSlug).toBe('python-intro');
  });
});
