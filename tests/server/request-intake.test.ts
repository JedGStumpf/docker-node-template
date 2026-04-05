/**
 * Tests for POST /api/requests (request intake) and GET /api/requests/:id.
 * Ticket 007 — Request intake API & verification email.
 */
import request from 'supertest';
import { prisma } from '../../server/src/services/prisma';
import { InMemoryEmailTransport } from '../../server/src/services/email.service';
import type { InstructorProfile } from '../../server/src/generated/prisma/client';
import { flushQueue } from './helpers/flush-queue';

process.env.NODE_ENV = 'test';
import app, { registry } from '../../server/src/app';

// Helper to access the in-memory email transport from the singleton registry
function getEmailTransport(): InMemoryEmailTransport {
  return (registry.email as any)['transport'] as InMemoryEmailTransport;
}

// A valid covered zip: needs an instructor in the DB that teaches python-intro near this zip.
const COVERED_ZIP = '90210';
const UNCOVERED_ZIP = '99999'; // Not in zip-centroids dataset

let testInstructor: InstructorProfile;

beforeAll(async () => {
  // Create an instructor that covers 90210 for python-intro
  testInstructor = await prisma.instructorProfile.create({
    data: {
      pike13UserId: 'intake-test-instructor',
      displayName: 'Intake Test Instructor',
      email: 'intake-instructor@example.com',
      topics: ['python-intro', 'scratch-basics'],
      homeZip: '90210',
      maxTravelMinutes: 60,
      serviceZips: [],
      active: true,
    },
  });
});

afterAll(async () => {
  // Clean up test instructor and any requests created
  await prisma.instructorAssignment.deleteMany({
    where: { instructorId: testInstructor.id },
  }).catch(() => {});
  await prisma.eventRequest.deleteMany({
    where: { requesterEmail: { contains: 'intake-test' } },
  }).catch(() => {});
  await prisma.instructorProfile.deleteMany({
    where: { pike13UserId: 'intake-test-instructor' },
  }).catch(() => {});
});

beforeEach(async () => {
  // Reset captured emails between tests
  getEmailTransport().reset();
  // Clear queued emails from previous tests
  await prisma.emailQueue.deleteMany();
  // Invalidate content cache so CONTENT_JSON_URL is picked up fresh
  registry.content.invalidateCache();
});

// Valid request body for happy-path tests
const VALID_BODY = {
  classSlug: 'python-intro',
  requesterName: 'Alice Intake',
  requesterEmail: 'alice-intake-test@example.com',
  groupType: 'school',
  expectedHeadcount: 25,
  zipCode: COVERED_ZIP,
  preferredDates: ['2026-05-01', '2026-05-08'],
};

describe('POST /api/requests', () => {
  it('returns 201 with id and status:unverified on valid submission', async () => {
    const res = await request(app).post('/api/requests').send(VALID_BODY);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe('unverified');
  });

  it('saves the request to the database with unverified status', async () => {
    const res = await request(app).post('/api/requests').send(VALID_BODY);
    expect(res.status).toBe(201);

    const saved = await prisma.eventRequest.findUnique({ where: { id: res.body.id } });
    expect(saved).not.toBeNull();
    expect(saved!.status).toBe('unverified');
    expect(saved!.requesterName).toBe('Alice Intake');
    expect(saved!.classSlug).toBe('python-intro');
  });

  it('sends a verification email to the requester', async () => {
    const res = await request(app).post('/api/requests').send(VALID_BODY);
    expect(res.status).toBe(201);

    await flushQueue(registry);
    const transport = getEmailTransport();
    const emails = transport.sent;
    expect(emails.length).toBeGreaterThan(0);

    const verifyEmail = emails.find((e) => e.to === VALID_BODY.requesterEmail);
    expect(verifyEmail).toBeDefined();
    expect(verifyEmail!.subject).toContain('Verify');
    // Email body should contain the requestId
    expect(verifyEmail!.text).toContain(res.body.id);
  });

  it('verification email link contains verificationToken from DB', async () => {
    const res = await request(app).post('/api/requests').send(VALID_BODY);
    expect(res.status).toBe(201);

    const saved = await prisma.eventRequest.findUnique({ where: { id: res.body.id } });
    await flushQueue(registry);
    const transport = getEmailTransport();
    const verifyEmail = transport.sent.find((e) => e.to === VALID_BODY.requesterEmail);

    expect(verifyEmail!.text).toContain(saved!.verificationToken);
  });

  it('sets verificationExpiresAt to approximately 1 hour from now', async () => {
    const before = Date.now();
    const res = await request(app).post('/api/requests').send(VALID_BODY);
    const after = Date.now();

    const saved = await prisma.eventRequest.findUnique({ where: { id: res.body.id } });
    const expiryMs = new Date(saved!.verificationExpiresAt).getTime();
    const ONE_HOUR_MS = 60 * 60 * 1000;

    expect(expiryMs).toBeGreaterThanOrEqual(before + ONE_HOUR_MS - 1000);
    expect(expiryMs).toBeLessThanOrEqual(after + ONE_HOUR_MS + 1000);
  });

  it('returns 422 for an unrecognized classSlug', async () => {
    const res = await request(app)
      .post('/api/requests')
      .send({ ...VALID_BODY, classSlug: 'nonexistent-class' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('invalid_class_slug');
  });

  it('returns 422 for a non-requestable classSlug', async () => {
    const res = await request(app)
      .post('/api/requests')
      .send({ ...VALID_BODY, classSlug: 'advanced-robotics' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('invalid_class_slug');
  });

  it('returns 201 with status no_instructor when zip has no matching instructors', async () => {
    const res = await request(app)
      .post('/api/requests')
      .send({ ...VALID_BODY, zipCode: UNCOVERED_ZIP });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe('no_instructor');
  });

  it('sends a verification email for uncovered-zip requests (no_instructor)', async () => {
    const res = await request(app)
      .post('/api/requests')
      .send({ ...VALID_BODY, zipCode: UNCOVERED_ZIP });
    expect(res.status).toBe(201);

    await flushQueue(registry);
    const transport = getEmailTransport();
    const verifyEmail = transport.sent.find(
      (e) => e.to === VALID_BODY.requesterEmail,
    );
    expect(verifyEmail).toBeDefined();
  });

  it('returns 201 with status unverified for covered-zip requests', async () => {
    const res = await request(app)
      .post('/api/requests')
      .send({ ...VALID_BODY, zipCode: COVERED_ZIP });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe('unverified');
  });

  it('returns 422 when required fields are missing', async () => {
    const { classSlug: _c, requesterName: _n, ...bodyWithout } = VALID_BODY;
    const res = await request(app).post('/api/requests').send(bodyWithout);
    expect(res.status).toBe(422);
    expect(res.body.fields).toEqual(expect.arrayContaining(['classSlug', 'requesterName']));
  });

  it('returns 422 when preferredDates is empty array', async () => {
    const res = await request(app)
      .post('/api/requests')
      .send({ ...VALID_BODY, preferredDates: [] });
    expect(res.status).toBe(422);
    expect(res.body.fields).toContain('preferredDates');
  });

  it('returns 422 when zipCode is not 5 digits', async () => {
    const res = await request(app)
      .post('/api/requests')
      .send({ ...VALID_BODY, zipCode: 'ABCDE' });
    expect(res.status).toBe(422);
  });

  it('accepts optional fields without error', async () => {
    const res = await request(app)
      .post('/api/requests')
      .send({
        ...VALID_BODY,
        locationFreeText: '123 Main St, Anytown',
        externalRegistrationUrl: 'https://example.com/register',
        siteControl: 'host',
        siteReadiness: 'ready',
        marketingCapability: 'email',
      });
    expect(res.status).toBe(201);
  });
});

describe('GET /api/requests/:id', () => {
  let createdRequestId: string;

  beforeAll(async () => {
    // Create a request to retrieve
    const res = await request(app).post('/api/requests').send(VALID_BODY);
    createdRequestId = res.body.id;
  });

  it('returns 200 + request JSON for a valid id', async () => {
    const res = await request(app).get(`/api/requests/${createdRequestId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdRequestId);
    expect(res.body.status).toBe('unverified');
    expect(res.body.classSlug).toBe('python-intro');
  });

  it('returns 404 for an unknown id', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).get(`/api/requests/${fakeId}`);
    expect(res.status).toBe(404);
  });
});
