process.env.NODE_ENV = 'test';

import { ServiceRegistry } from '../../server/src/services/service.registry';
import { MockPike13Client } from '../../server/src/services/pike13.client';

const services = ServiceRegistry.create('UI');
const prisma = services.prisma;

// Access the mock client for assertions
const pike13Client = services.pike13Client as MockPike13Client;

beforeEach(async () => {
  await services.clearAll();
  if ('bookInstructorCalls' in pike13Client) {
    pike13Client.bookInstructorCalls = [];
  }
});

describe('Pike13 bookInstructor', () => {
  it('returns an appointment ID from mock client', async () => {
    const result = await pike13Client.bookInstructor('pike-user-1', new Date('2026-05-01'), 'python-intro');
    expect(result).not.toBeNull();
    expect(result!.appointmentId).toBeTruthy();
  });

  it('records the call parameters', async () => {
    const date = new Date('2026-06-15');
    await pike13Client.bookInstructor('pike-user-2', date, 'scratch-basics');
    
    expect(pike13Client.bookInstructorCalls).toHaveLength(1);
    expect(pike13Client.bookInstructorCalls[0].pike13UserId).toBe('pike-user-2');
    expect(pike13Client.bookInstructorCalls[0].classSlug).toBe('scratch-basics');
  });
});
