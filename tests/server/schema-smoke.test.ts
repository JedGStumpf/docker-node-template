/**
 * Prisma schema smoke test — verifies Sprint 1 models round-trip correctly.
 * Especially important for array fields in SQLite (stored as JSON strings).
 */
import { prisma } from '../../server/src/services/prisma';

process.env.NODE_ENV = 'test';

describe('Schema smoke test: Sprint 1 models', () => {
  afterAll(async () => {
    // Clean up in FK-safe order
    await prisma.instructorAssignment.deleteMany().catch(() => {});
    await prisma.eventRequest.deleteMany().catch(() => {});
    await prisma.instructorProfile.deleteMany().catch(() => {});
  });

  describe('InstructorProfile', () => {
    it('creates and reads back with array fields', async () => {
      const profile = await prisma.instructorProfile.create({
        data: {
          pike13UserId: 'smoke-test-pike13-001',
          displayName: 'Smoke Test Instructor',
          email: 'smoke@example.com',
          topics: ['python-intro', 'scratch-basics'],
          homeZip: '90210',
          maxTravelMinutes: 45,
          serviceZips: ['90211', '90212'],
          active: true,
        },
      });

      expect(profile.id).toBeDefined();
      expect(profile.pike13UserId).toBe('smoke-test-pike13-001');
      expect(Array.isArray(profile.topics)).toBe(true);
      expect(profile.topics).toEqual(['python-intro', 'scratch-basics']);
      expect(Array.isArray(profile.serviceZips)).toBe(true);
      expect(profile.serviceZips).toEqual(['90211', '90212']);

      // Read back via findUnique
      const found = await prisma.instructorProfile.findUnique({
        where: { pike13UserId: 'smoke-test-pike13-001' },
      });
      expect(found).not.toBeNull();
      expect(Array.isArray(found!.topics)).toBe(true);
      expect(found!.topics).toEqual(['python-intro', 'scratch-basics']);
      expect(Array.isArray(found!.serviceZips)).toBe(true);
      expect(found!.serviceZips).toEqual(['90211', '90212']);

      // Clean up
      await prisma.instructorProfile.delete({ where: { id: profile.id } });
    });

    it('creates profile with empty serviceZips', async () => {
      const profile = await prisma.instructorProfile.create({
        data: {
          pike13UserId: 'smoke-test-pike13-002',
          displayName: 'No ServiceZips Instructor',
          email: 'noservicezip@example.com',
          topics: ['python-intro'],
          homeZip: '10001',
          maxTravelMinutes: 60,
          serviceZips: [],
        },
      });

      expect(Array.isArray(profile.serviceZips)).toBe(true);
      expect(profile.serviceZips).toEqual([]);

      // Read back
      const found = await prisma.instructorProfile.findUnique({
        where: { id: profile.id },
      });
      expect(Array.isArray(found!.serviceZips)).toBe(true);
      expect(found!.serviceZips).toEqual([]);

      await prisma.instructorProfile.delete({ where: { id: profile.id } });
    });
  });

  describe('EventRequest', () => {
    it('creates and reads back with preferredDates array', async () => {
      const req = await prisma.eventRequest.create({
        data: {
          classSlug: 'python-intro',
          requesterName: 'Smoke Test User',
          requesterEmail: 'requester@example.com',
          groupType: 'school',
          expectedHeadcount: 25,
          zipCode: '90210',
          preferredDates: ['2026-04-15', '2026-04-22'],
          verificationToken: crypto.randomUUID(),
          verificationExpiresAt: new Date(Date.now() + 3600000),
          status: 'unverified',
        },
      });

      expect(req.id).toBeDefined();
      expect(Array.isArray(req.preferredDates)).toBe(true);
      expect(req.preferredDates).toEqual(['2026-04-15', '2026-04-22']);
      expect(req.status).toBe('unverified');

      // Read back
      const found = await prisma.eventRequest.findUnique({ where: { id: req.id } });
      expect(found).not.toBeNull();
      expect(Array.isArray(found!.preferredDates)).toBe(true);
      expect(found!.preferredDates).toEqual(['2026-04-15', '2026-04-22']);

      await prisma.eventRequest.delete({ where: { id: req.id } });
    });
  });

  describe('InstructorAssignment', () => {
    it('creates and reads back an assignment', async () => {
      // Create prerequisite records
      const profile = await prisma.instructorProfile.create({
        data: {
          pike13UserId: 'smoke-test-pike13-003',
          displayName: 'Assignment Test Instructor',
          email: 'assigntest@example.com',
          topics: ['python-intro'],
          homeZip: '90210',
          maxTravelMinutes: 60,
          serviceZips: [],
        },
      });

      const req = await prisma.eventRequest.create({
        data: {
          classSlug: 'python-intro',
          requesterName: 'Assignment Test User',
          requesterEmail: 'assignreq@example.com',
          groupType: 'scout',
          expectedHeadcount: 10,
          zipCode: '90210',
          preferredDates: ['2026-05-01'],
          verificationToken: crypto.randomUUID(),
          verificationExpiresAt: new Date(Date.now() + 3600000),
          status: 'new',
        },
      });

      const assignment = await prisma.instructorAssignment.create({
        data: {
          requestId: req.id,
          instructorId: profile.id,
          status: 'pending',
          notificationToken: crypto.randomUUID(),
          notifiedAt: new Date(),
        },
      });

      expect(assignment.id).toBeDefined();
      expect(assignment.status).toBe('pending');
      expect(assignment.reminderCount).toBe(0);

      // Read back
      const found = await prisma.instructorAssignment.findUnique({
        where: { id: assignment.id },
      });
      expect(found).not.toBeNull();
      expect(found!.status).toBe('pending');

      // Cleanup (cascade via request delete)
      await prisma.instructorAssignment.delete({ where: { id: assignment.id } });
      await prisma.eventRequest.delete({ where: { id: req.id } });
      await prisma.instructorProfile.delete({ where: { id: profile.id } });
    });

    it('supports all status values for InstructorAssignment', async () => {
      const profile = await prisma.instructorProfile.create({
        data: {
          pike13UserId: 'smoke-test-pike13-004',
          displayName: 'Status Test Instructor',
          email: 'statustest@example.com',
          topics: ['python-intro'],
          homeZip: '10001',
          maxTravelMinutes: 30,
          serviceZips: [],
        },
      });

      const req = await prisma.eventRequest.create({
        data: {
          classSlug: 'python-intro',
          requesterName: 'Status Test',
          requesterEmail: 'statustest@example.com',
          groupType: 'library',
          expectedHeadcount: 15,
          zipCode: '10001',
          preferredDates: [],
          verificationToken: crypto.randomUUID(),
          verificationExpiresAt: new Date(Date.now() + 3600000),
          status: 'new',
        },
      });

      const statuses = ['pending', 'accepted', 'declined', 'timed_out'];
      for (const status of statuses) {
        const a = await prisma.instructorAssignment.create({
          data: {
            requestId: req.id,
            instructorId: profile.id,
            status,
            notificationToken: crypto.randomUUID(),
          },
        });
        expect(a.status).toBe(status);
        await prisma.instructorAssignment.delete({ where: { id: a.id } });
      }

      await prisma.eventRequest.delete({ where: { id: req.id } });
      await prisma.instructorProfile.delete({ where: { id: profile.id } });
    });
  });
});
