import type { ServiceSource } from '../contracts/index';

// Import the lazy-init prisma (the actual PrismaClient proxy)
import { prisma as defaultPrisma } from './prisma';

// Import existing service functions
import { initConfigCache, getConfig, getAllConfig, setConfig, exportConfig } from './config';
import { logBuffer } from './logBuffer';
import { UserService } from './user.service';
import { PermissionsService } from './permissions.service';
import { SchedulerService } from './scheduler.service';
import { BackupService } from './backup.service';
import { SessionService } from './session.service';
import { ChannelService } from './channel.service';
import { MessageService } from './message.service';

// Sprint 1 services
import { ContentService } from './content.service';
import { MatchingService } from './matching.service';
import { RequestService } from './request.service';
import { InstructorService } from './instructor.service';
import { EmailService, InMemoryEmailTransport, SesEmailTransport } from './email.service';
import { MockPike13Client, RealPike13Client, type IPike13Client } from './pike13.client';
import { SiteService } from './site.service';
import { AsanaService } from './asana.service';
import { MockAsanaClient, RealAsanaClient } from './asana.client';
import { RegistrationService } from './registration.service';
import { EmailQueueService } from './email-queue.service';
import { MeetupService } from './meetup.service';
import { MockMeetupClient, RealMeetupClient, type IMeetupClient } from './meetup.client';
import { GoogleCalendarService } from './google-calendar.service';
import { MockGoogleCalendarClient, RealGoogleCalendarClient, type IGoogleCalendarClient } from './google-calendar.client';

export class ServiceRegistry {
  readonly source: ServiceSource;
  readonly users: UserService;
  readonly permissions: PermissionsService;
  readonly scheduler: SchedulerService;
  readonly backups: BackupService;
  readonly sessions: SessionService;
  readonly channels: ChannelService;
  readonly messages: MessageService;

  // Sprint 1 services
  readonly content: ContentService;
  readonly pike13Client: IPike13Client;
  readonly matching: MatchingService;
  readonly requests: RequestService;
  readonly instructors: InstructorService;
  readonly email: EmailService;
  readonly sites: SiteService;
  readonly asana: AsanaService;
  readonly registration: RegistrationService;
  readonly emailQueue: EmailQueueService;

  // Sprint 4 services
  readonly meetupClient: IMeetupClient;
  readonly meetup: MeetupService;
  readonly googleCalendarClient: IGoogleCalendarClient;
  readonly googleCalendar: GoogleCalendarService;

  private constructor(source: ServiceSource = 'UI') {
    this.source = source;
    this.users = new UserService(defaultPrisma);
    this.permissions = new PermissionsService(defaultPrisma);
    this.scheduler = new SchedulerService(defaultPrisma);
    this.backups = new BackupService(defaultPrisma);
    this.sessions = new SessionService(defaultPrisma);
    this.channels = new ChannelService(defaultPrisma);
    this.messages = new MessageService(defaultPrisma);

    // Sprint 1 service instantiation
    this.content = new ContentService();

    // Pike13Client: use mock in test environment
    if (process.env.NODE_ENV === 'test') {
      this.pike13Client = new MockPike13Client();
    } else {
      this.pike13Client = new RealPike13Client();
    }

    this.matching = new MatchingService(defaultPrisma, this.pike13Client);
    this.instructors = new InstructorService(defaultPrisma);

    this.emailQueue = new EmailQueueService(defaultPrisma);

    // Email transport: use in-memory mock in test environment
    if (process.env.NODE_ENV === 'test') {
      this.email = new EmailService(new InMemoryEmailTransport(), this.emailQueue);
    } else {
      this.email = new EmailService(new SesEmailTransport(), this.emailQueue);
    }

    this.sites = new SiteService(defaultPrisma);

    if (process.env.NODE_ENV === 'production') {
      this.asana = new AsanaService(new RealAsanaClient());
    } else {
      this.asana = new AsanaService(new MockAsanaClient());
    }

    this.registration = new RegistrationService(defaultPrisma);

    // Sprint 4 services — Meetup, Google Calendar
    if (process.env.NODE_ENV === 'test') {
      this.meetupClient = new MockMeetupClient();
      this.googleCalendarClient = new MockGoogleCalendarClient();
    } else {
      this.meetupClient = new RealMeetupClient();
      this.googleCalendarClient = new RealGoogleCalendarClient();
    }

    this.meetup = new MeetupService(defaultPrisma, this.meetupClient, this.content);
    this.googleCalendar = new GoogleCalendarService(defaultPrisma, this.googleCalendarClient);

    this.requests = new RequestService(defaultPrisma, {
      meetupService: this.meetup,
      googleCalendarService: this.googleCalendar,
      pike13Client: this.pike13Client,
    });
  }

  static create(source?: ServiceSource): ServiceRegistry {
    return new ServiceRegistry(source);
  }

  // --- Config ---
  get config() {
    return { initCache: initConfigCache, get: getConfig, getAll: getAllConfig, set: setConfig, export: exportConfig };
  }

  // --- Logs ---
  get logs() {
    return logBuffer;
  }

  // --- Prisma (for direct DB access when needed) ---
  get prisma() {
    return defaultPrisma;
  }

  /**
   * Delete all business data from the database in FK-safe order.
   * Preserves system tables (Config, Session).
   */
  async clearAll(): Promise<void> {
    const p = this.prisma;
    await p.message.deleteMany();
    await p.channel.deleteMany();
    await p.scheduledJob.deleteMany();
    await p.roleAssignmentPattern.deleteMany();
    // Sprint 1 models (FK-safe order)
    try {
      await p.emailQueue.deleteMany();
      await p.registration.deleteMany();
      await p.siteRepSession.deleteMany();
      await p.siteRep.deleteMany();
      await p.siteInvitation.deleteMany();
      await p.registeredSite.deleteMany();
      await p.instructorAssignment.deleteMany();
      await p.eventRequest.deleteMany();
      await p.instructorProfile.deleteMany();
    } catch {
      // Tables may not exist yet in older migrations
    }
    await p.user.deleteMany();
  }
}
