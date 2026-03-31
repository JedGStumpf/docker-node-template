import type { IAsanaClient } from './asana.client';

export class AsanaService {
  constructor(private client: IAsanaClient) {}

  async createRequestTask(request: {
    id: string;
    classSlug: string;
    requesterName: string;
    requesterEmail: string;
    zipCode: string;
    preferredDates?: string[];
    groupType?: string;
    expectedHeadcount?: number;
  }): Promise<{ gid: string } | null> {
    const projectGid = process.env.ASANA_PROJECT_GID;
    const accessToken = process.env.ASANA_ACCESS_TOKEN;

    if (!projectGid || !accessToken) {
      console.warn('AsanaService: ASANA_PROJECT_GID or ASANA_ACCESS_TOKEN not configured, skipping task creation');
      return null;
    }

    const assigneeGid = process.env.ASANA_ASSIGNEE_GID;
    const preferredDates = Array.isArray(request.preferredDates) ? request.preferredDates.join(', ') : 'N/A';
    const name = `Event request ${request.id} — ${request.classSlug}`;
    const notes = [
      `Request ID: ${request.id}`,
      `Class: ${request.classSlug}`,
      `Requester: ${request.requesterName} <${request.requesterEmail}>`,
      `ZIP: ${request.zipCode}`,
      `Group Type: ${request.groupType || 'N/A'}`,
      `Expected Headcount: ${request.expectedHeadcount ?? 'N/A'}`,
      `Preferred Dates: ${preferredDates}`,
    ].join('\n');

    try {
      return await this.client.createTask({
        name,
        notes,
        projectGid,
        assigneeGid: assigneeGid || undefined,
      });
    } catch (error) {
      console.warn('AsanaService: failed to create task, continuing without Asana', error);
      return null;
    }
  }
}
