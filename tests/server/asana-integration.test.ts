import { AsanaService } from '../../server/src/services/asana.service';
import { ServiceRegistry } from '../../server/src/services/service.registry';
import type { IAsanaClient } from '../../server/src/services/asana.client';

class StubAsanaClient implements IAsanaClient {
  public calls = 0;

  async createTask(): Promise<{ gid: string }> {
    this.calls += 1;
    return { gid: 'stub-gid-123' };
  }
}

describe('AsanaService', () => {
  const OLD_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it('returns null gracefully when Asana env is unconfigured', async () => {
    delete process.env.ASANA_ACCESS_TOKEN;
    delete process.env.ASANA_PROJECT_GID;

    const stub = new StubAsanaClient();
    const service = new AsanaService(stub);

    const result = await service.createRequestTask({
      id: 'req-1',
      classSlug: 'python-intro',
      requesterName: 'Test User',
      requesterEmail: 'test@example.com',
      zipCode: '90210',
    });

    expect(result).toBeNull();
    expect(stub.calls).toBe(0);
  });

  it('creates a task when Asana env is configured', async () => {
    process.env.ASANA_ACCESS_TOKEN = 'fake-token';
    process.env.ASANA_PROJECT_GID = 'project-1';
    process.env.ASANA_ASSIGNEE_GID = 'assignee-1';

    const stub = new StubAsanaClient();
    const service = new AsanaService(stub);

    const result = await service.createRequestTask({
      id: 'req-2',
      classSlug: 'scratch-basics',
      requesterName: 'Another User',
      requesterEmail: 'another@example.com',
      zipCode: '10001',
      preferredDates: ['2026-04-10T10:00:00.000Z'],
      groupType: 'school',
      expectedHeadcount: 25,
    });

    expect(result).toEqual({ gid: 'stub-gid-123' });
    expect(stub.calls).toBe(1);
  });

  it('uses mock Asana client in non-production ServiceRegistry', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ASANA_ACCESS_TOKEN = 'fake-token';
    process.env.ASANA_PROJECT_GID = 'project-1';

    const services = ServiceRegistry.create('UI');
    const task = await services.asana.createRequestTask({
      id: 'req-3',
      classSlug: 'python-intro',
      requesterName: 'Mock User',
      requesterEmail: 'mock@example.com',
      zipCode: '90210',
    });

    expect(task).not.toBeNull();
    expect(task!.gid.startsWith('mock-task-')).toBe(true);
  });
});
