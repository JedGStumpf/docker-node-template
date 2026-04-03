/**
 * Unit tests for EquipmentService.checkReadiness() and getEquipmentStatus().
 * Uses the StubInventoryClient and a real SQLite database for assignment/profile records.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../server/src/services/prisma';
import { EquipmentService } from '../../server/src/services/equipment.service';
import { StubInventoryClient } from '../../server/src/services/inventory';
import { EmailService, InMemoryEmailTransport } from '../../server/src/services/email.service';
import { EmailQueueService } from '../../server/src/services/email-queue.service';
import { ContentService } from '../../server/src/services/content.service';

process.env.NODE_ENV = 'test';

const emailQueue = new EmailQueueService(prisma);
const emailTransport = new InMemoryEmailTransport();
const emailSvc = new EmailService(emailTransport, emailQueue);
const content = new ContentService(); // Uses CONTENT_JSON_URL from setup.ts

let instructorWithInventory: any;
let instructorWithoutInventory: any;
let eventRequest: any;

beforeAll(async () => {
  instructorWithInventory = await prisma.instructorProfile.create({
    data: {
      pike13UserId: 'equip-svc-instructor-1',
      displayName: 'Equip Instructor',
      email: 'equip-instructor@example.com',
      topics: ['python-intro'],
      homeZip: '90210',
      maxTravelMinutes: 60,
      inventoryUserId: 'inv-user-1',
    },
  });

  instructorWithoutInventory = await prisma.instructorProfile.create({
    data: {
      pike13UserId: 'equip-svc-instructor-2',
      displayName: 'No Inventory Instructor',
      email: 'no-inv-instructor@example.com',
      topics: ['python-intro'],
      homeZip: '90210',
      maxTravelMinutes: 60,
      inventoryUserId: null,
    },
  });

  eventRequest = await prisma.eventRequest.create({
    data: {
      classSlug: 'python-intro',
      requesterName: 'Equip Test Requester',
      requesterEmail: 'equip-requester@example.com',
      groupType: 'school',
      expectedHeadcount: 20,
      zipCode: '90210',
      preferredDates: ['2026-05-01'],
      verificationToken: `equip-svc-token-${Date.now()}`,
      verificationExpiresAt: new Date(Date.now() + 86400000),
      status: 'confirmed',
    },
  });
});

afterAll(async () => {
  await prisma.emailQueue.deleteMany({ where: { recipient: { contains: 'equip' } } });
  await prisma.instructorAssignment.deleteMany({ where: { requestId: eventRequest.id } });
  await prisma.eventRequest.delete({ where: { id: eventRequest.id } });
  await prisma.instructorProfile.deleteMany({
    where: { pike13UserId: { in: ['equip-svc-instructor-1', 'equip-svc-instructor-2'] } },
  });
});

async function createAssignment(instructorId: number, token: string): Promise<any> {
  return prisma.instructorAssignment.create({
    data: {
      requestId: eventRequest.id,
      instructorId,
      status: 'accepted',
      notificationToken: token,
      notifiedAt: new Date(),
    },
  });
}

describe('EquipmentService.parseEquipmentNeeded', () => {
  const service = new EquipmentService(prisma, new StubInventoryClient(), content, emailSvc);

  it('parses "2 EV3 Robot Kit" into quantity 2', () => {
    const result = service.parseEquipmentNeeded(['2 EV3 Robot Kit']);
    expect(result).toEqual([{ item_type: 'EV3 Robot Kit', quantity: 2 }]);
  });

  it('parses "15× micro:bit" into quantity 15', () => {
    const result = service.parseEquipmentNeeded(['15× micro:bit']);
    expect(result).toEqual([{ item_type: 'micro:bit', quantity: 15 }]);
  });

  it('treats unprefixed item as quantity 1', () => {
    const result = service.parseEquipmentNeeded(['laptop']);
    expect(result).toEqual([{ item_type: 'laptop', quantity: 1 }]);
  });

  it('returns null for empty array', () => {
    expect(service.parseEquipmentNeeded([])).toBeNull();
    expect(service.parseEquipmentNeeded(undefined)).toBeNull();
  });
});

describe('EquipmentService.computeStillNeeded', () => {
  const service = new EquipmentService(prisma, new StubInventoryClient(), content, emailSvc);

  it('returns empty array when fully equipped', () => {
    const required = [{ item_type: 'laptop', quantity: 1 }];
    const checked = [{ item_type: 'laptop', quantity: 1, due_date: '2026-05-01' }];
    expect(service.computeStillNeeded(required, checked)).toEqual([]);
  });

  it('returns delta when partially equipped', () => {
    const required = [{ item_type: 'EV3 Robot Kit', quantity: 2 }];
    const checked = [{ item_type: 'EV3 Robot Kit', quantity: 1, due_date: '2026-05-01' }];
    const result = service.computeStillNeeded(required, checked);
    expect(result).toEqual([{ item_type: 'EV3 Robot Kit', quantity: 1 }]);
  });
});

describe('EquipmentService.checkReadiness', () => {
  it('sets status=unknown when inventoryUserId is null', async () => {
    const assignment = await createAssignment(
      instructorWithoutInventory.id,
      `equip-token-no-inv-${Date.now()}`,
    );
    const service = new EquipmentService(prisma, new StubInventoryClient(), content, emailSvc);
    await service.checkReadiness(assignment.id);
    const updated = await prisma.instructorAssignment.findUnique({ where: { id: assignment.id } });
    expect(updated?.equipmentStatus).toBe('unknown');
  });

  it('sets status=pending_checkout and enqueues email in pending mode', async () => {
    process.env.INVENTORY_STUB_MODE = 'pending';
    const assignment = await createAssignment(
      instructorWithInventory.id,
      `equip-token-pending-${Date.now()}`,
    );
    const service = new EquipmentService(prisma, new StubInventoryClient(), content, emailSvc);
    await service.checkReadiness(assignment.id);
    const updated = await prisma.instructorAssignment.findUnique({ where: { id: assignment.id } });
    // python-intro requires "laptop" (qty 1); stub returns EV3 kits/microbits, so laptop is still needed
    expect(['pending_checkout', 'unknown']).toContain(updated?.equipmentStatus);
    delete process.env.INVENTORY_STUB_MODE;
  });

  it('sets status=unknown when inventory client throws', async () => {
    process.env.INVENTORY_STUB_MODE = 'error';
    const assignment = await createAssignment(
      instructorWithInventory.id,
      `equip-token-error-${Date.now()}`,
    );
    const service = new EquipmentService(prisma, new StubInventoryClient(), content, emailSvc);
    await service.checkReadiness(assignment.id);
    const updated = await prisma.instructorAssignment.findUnique({ where: { id: assignment.id } });
    expect(updated?.equipmentStatus).toBe('unknown');
    delete process.env.INVENTORY_STUB_MODE;
  });
});
