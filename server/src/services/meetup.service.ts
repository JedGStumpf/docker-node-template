/**
 * MeetupService — manages Meetup event creation and RSVP sync.
 */

import type { IMeetupClient } from './meetup.client';
import type { ContentService } from './content.service';

export class MeetupService {
  constructor(
    private prisma: any,
    private meetupClient: IMeetupClient,
    private contentService: ContentService,
  ) {}

  /**
   * Create a Meetup event for a confirmed public EventRequest.
   * Returns the Meetup event ID and URL, or null if Meetup is not configured.
   */
  async createMeetupEvent(request: any): Promise<{ meetupEventId: string; meetupEventUrl: string } | null> {
    const groupUrlname = process.env.MEETUP_GROUP_URLNAME;
    if (!groupUrlname) {
      console.warn('MeetupService: MEETUP_GROUP_URLNAME not configured, skipping Meetup event creation');
      return null;
    }

    // Build description from class details
    const classInfo = await this.contentService.getClassBySlug(request.classSlug);
    const title = classInfo?.title || request.classSlug;

    // Check for group-specific mapping (fallback logging)
    const groupMapping = await this.getGroupMapping(request.classSlug);
    let resolvedGroupUrlname = groupUrlname;
    if (!groupMapping) {
      // Log structured fallback warning
      console.warn(JSON.stringify({
        level: 'warn',
        event: 'meetup_group_mapping_fallback',
        classSlug: request.classSlug,
        fallback: groupUrlname,
        requestId: request.id,
      }));
    } else {
      resolvedGroupUrlname = groupMapping;
    }

    let description = '';

    // Put external registration link prominently at top if present
    if (request.externalRegistrationUrl) {
      description += `🔗 **Register here:** ${request.externalRegistrationUrl}\n\n`;
    }

    if (classInfo?.description) {
      description += classInfo.description + '\n\n';
    }

    description += `Hosted by: ${request.requesterName}\n`;
    if (request.locationFreeText) {
      description += `Location: ${request.locationFreeText}\n`;
    }
    if (classInfo?.ageRange) {
      description += `Ages: ${classInfo.ageRange}\n`;
    }

    // Note if using fallback group
    if (!groupMapping) {
      description += `\n[Group: ${resolvedGroupUrlname}]`;
    }

    const result = await this.meetupClient.createEvent({
      title,
      description,
      date: request.confirmedDate || new Date(),
      location: request.locationFreeText,
      groupUrlname: resolvedGroupUrlname,
    });

    return { meetupEventId: result.eventId, meetupEventUrl: result.eventUrl };
  }

  /**
   * Look up the Meetup group URL name for a given class slug.
   * Returns the mapped group urlname, or null if no mapping exists.
   * Override in subclasses or via MEETUP_GROUP_MAPPING env var (JSON object).
   */
  async getGroupMapping(classSlug: string): Promise<string | null> {
    const mappingJson = process.env.MEETUP_GROUP_MAPPING;
    if (!mappingJson) return null;
    try {
      const mapping = JSON.parse(mappingJson) as Record<string, string>;
      return mapping[classSlug] || null;
    } catch {
      return null;
    }
  }

  /**
   * Sync RSVP count from Meetup for a given request.
   */
  async syncRsvps(requestId: string): Promise<void> {
    const request = await this.prisma.eventRequest.findUnique({ where: { id: requestId } });
    if (!request?.meetupEventId) {
      return;
    }

    const rsvps = await this.meetupClient.getRsvps(request.meetupEventId);

    await this.prisma.eventRequest.update({
      where: { id: requestId },
      data: { meetupRsvpCount: rsvps.count },
    });
  }
}
