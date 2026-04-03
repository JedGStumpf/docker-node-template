import type { IAsanaClient } from './asana.client';

export class AsanaService {
  constructor(private client: IAsanaClient, private prisma?: any) {}

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

  /**
   * Sprint 5: Post an AI extraction summary as a comment on the Asana task.
   * Fire-and-forget: errors are caught and logged.
   */
  async pushExtractionUpdate(requestId: string, extraction: {
    statusSignal?: string | null;
    actionItems?: string[];
    hostRegistrationCount?: number | null;
  }): Promise<void> {
    if (!process.env.ASANA_ACCESS_TOKEN) {
      return; // Graceful degradation
    }

    if (!this.prisma) return;

    const request = await this.prisma.eventRequest.findUnique({
      where: { id: requestId },
      select: { asanaTaskId: true },
    }).catch(() => null);

    if (!request?.asanaTaskId) {
      console.log(`AsanaService: no Asana task for request ${requestId}, skipping comment`);
      return;
    }

    const actionItemsStr = extraction.actionItems?.length
      ? extraction.actionItems.join('; ')
      : 'none';

    const comment = [
      'AI extraction from inbound email:',
      `Status signal: ${extraction.statusSignal || 'none'}`,
      `Action items: ${actionItemsStr}`,
      extraction.hostRegistrationCount != null
        ? `Host registration count: ${extraction.hostRegistrationCount}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await this.client.addComment(request.asanaTaskId, comment);
    } catch (err: any) {
      console.error(`AsanaService: failed to add comment to task ${request.asanaTaskId}: ${err.message}`);
    }
  }
}
