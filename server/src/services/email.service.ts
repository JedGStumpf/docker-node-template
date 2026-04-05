/**
 * EmailService — outbound-only email dispatch.
 *
 * Uses an injectable transport interface so tests can capture sent messages
 * without making real SES calls.
 */

import type { EmailQueueService } from './email-queue.service';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  requestId?: string;
}

export interface IEmailTransport {
  send(message: EmailMessage): Promise<void>;
}

/**
 * In-memory transport for tests. Messages are pushed to `sent` array.
 */
export class InMemoryEmailTransport implements IEmailTransport {
  sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }

  reset() {
    this.sent = [];
  }
}

/**
 * Nodemailer-based transport for production (SES).
 * Lazily instantiated so missing credentials don't crash startup.
 */
export class SesEmailTransport implements IEmailTransport {
  async send(message: EmailMessage): Promise<void> {
    // In Sprint 1 production wiring, this would use nodemailer + SES.
    // If SES is not configured, log and degrade gracefully.
    const fromAddress = process.env.EMAIL_FROM || 'noreply@jointheleague.org';
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport({
        host: process.env.SMTP_HOST || 'localhost',
        port: Number(process.env.SMTP_PORT) || 25,
        secure: false,
      });
      await transporter.sendMail({
        from: fromAddress,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.replyTo,
        attachments: message.attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
    } catch (err) {
      console.error('EmailService: failed to send email', err);
      // Degrade gracefully — do not throw
    }
  }
}

export class EmailService {
  private emailQueue?: EmailQueueService;
  
  constructor(private transport: IEmailTransport, emailQueue?: EmailQueueService) {
    this.emailQueue = emailQueue;
  }

  /** Internal: send via queue if available, otherwise direct transport */
  private async dispatch(message: EmailMessage): Promise<void> {
    if (this.emailQueue) {
      await this.emailQueue.enqueue(message);
    } else {
      await this.transport.send(message);
    }
  }

  /** Expose the transport for the queue worker */
  getTransport(): IEmailTransport {
    return this.transport;
  }

  async sendVerificationEmail(opts: {
    to: string;
    requestId: string;
    token: string;
    baseUrl?: string;
  }): Promise<void> {
    const base = opts.baseUrl || process.env.APP_BASE_URL || 'http://localhost:3000';
    const link = `${base}/api/requests/${opts.requestId}/verify?token=${opts.token}`;
    await this.dispatch({
      to: opts.to,
      subject: 'Verify your Tech Club event request',
      text: `Please verify your event request by clicking the link below. This link expires in 1 hour.\n\n${link}`,
      html: `<p>Please verify your event request by clicking the link below. This link expires in 1 hour.</p><p><a href="${link}">Verify your request</a></p>`,
    });
  }

  async sendMatchNotification(opts: {
    to: string;
    assignmentId: string;
    notificationToken: string;
    requestId: string;
    classTitle: string;
    requesterName: string;
    zipCode: string;
    preferredDates: string[];
    baseUrl?: string;
    replyTo?: string;
  }): Promise<void> {
    const base = opts.baseUrl || process.env.APP_BASE_URL || 'http://localhost:3000';
    const acceptUrl = `${base}/api/instructor/assignments/${opts.assignmentId}/accept?token=${opts.notificationToken}`;
    const declineUrl = `${base}/api/instructor/assignments/${opts.assignmentId}/decline?token=${opts.notificationToken}`;
    const datesStr = opts.preferredDates.join(', ');
    await this.dispatch({
      to: opts.to,
      subject: `New Tech Club event request — ${opts.classTitle}`,
      text: `A new event request has been matched to you.\n\nClass: ${opts.classTitle}\nRequester: ${opts.requesterName}\nZip: ${opts.zipCode}\nPreferred dates: ${datesStr}\n\nAccept: ${acceptUrl}\nDecline: ${declineUrl}`,
      html: `<p>A new event request has been matched to you.</p><ul><li>Class: ${opts.classTitle}</li><li>Requester: ${opts.requesterName}</li><li>Zip: ${opts.zipCode}</li><li>Preferred dates: ${datesStr}</li></ul><p><a href="${acceptUrl}">Accept</a> | <a href="${declineUrl}">Decline</a></p>`,
      replyTo: opts.replyTo,
    });
  }

  async sendMatchReminder(opts: {
    to: string;
    assignmentId: string;
    notificationToken: string;
    requestId: string;
    classTitle: string;
    baseUrl?: string;
    replyTo?: string;
  }): Promise<void> {
    const base = opts.baseUrl || process.env.APP_BASE_URL || 'http://localhost:3000';
    const acceptUrl = `${base}/api/instructor/assignments/${opts.assignmentId}/accept?token=${opts.notificationToken}`;
    const declineUrl = `${base}/api/instructor/assignments/${opts.assignmentId}/decline?token=${opts.notificationToken}`;
    await this.dispatch({
      to: opts.to,
      subject: `Reminder: Tech Club event request — ${opts.classTitle}`,
      text: `This is a reminder that you have a pending event request.\n\nClass: ${opts.classTitle}\n\nAccept: ${acceptUrl}\nDecline: ${declineUrl}`,
      html: `<p>This is a reminder that you have a pending event request.</p><p>Class: ${opts.classTitle}</p><p><a href="${acceptUrl}">Accept</a> | <a href="${declineUrl}">Decline</a></p>`,
      replyTo: opts.replyTo,
    });
  }

  async sendAdminNewRequestNotification(opts: {
    requestId: string;
    classTitle: string;
    requesterName: string;
    noMatchAvailable?: boolean;
    replyTo?: string;
  }): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@jointheleague.org';
    const subject = opts.noMatchAvailable
      ? `No instructor match available — ${opts.classTitle}`
      : `New Tech Club event request — ${opts.classTitle}`;
    const body = opts.noMatchAvailable
      ? `No available instructors were found for request ${opts.requestId} (${opts.classTitle} from ${opts.requesterName}). Manual assignment needed.`
      : `A new event request has been submitted. Request ID: ${opts.requestId}. Class: ${opts.classTitle}. Requester: ${opts.requesterName}.`;
    await this.dispatch({
      to: adminEmail,
      subject,
      text: body,
      replyTo: opts.replyTo,
    });
  }

  async sendSiteInvitation(email: string, name: string, inviteUrl: string): Promise<void> {
    await this.dispatch({
      to: email,
      subject: 'You are invited to register your site',
      text: `Hi ${name},\n\nYou have been invited to register your site for League events.\n\nUse this link to complete registration:\n${inviteUrl}\n\nThis invitation expires in 7 days.`,
      html: `<p>Hi ${name},</p><p>You have been invited to register your site for League events.</p><p><a href="${inviteUrl}">Complete site registration</a></p><p>This invitation expires in 7 days.</p>`,
    });
  }

  async sendMagicLink(email: string, magicUrl: string): Promise<void> {
    await this.dispatch({
      to: email,
      subject: 'Your magic sign-in link',
      text: `Use this link to sign in:\n${magicUrl}\n\nThis link expires in 24 hours.`,
      html: `<p>Use this link to sign in:</p><p><a href="${magicUrl}">Sign in</a></p><p>This link expires in 24 hours.</p>`,
    });
  }

  async sendSiteRepNotification(
    siteRep: { email: string; displayName?: string | null; site?: { name?: string | null } | null },
    request: {
      id: string;
      classSlug: string;
      requesterName: string;
      preferredDates?: string[];
      zipCode?: string;
    },
    replyTo?: string,
  ): Promise<void> {
    const repName = siteRep.displayName || 'there';
    const siteName = siteRep.site?.name || 'your site';
    const dates = Array.isArray(request.preferredDates) && request.preferredDates.length > 0
      ? request.preferredDates.join(', ')
      : 'TBD';
    await this.dispatch({
      to: siteRep.email,
      subject: `New request matched for ${siteName}`,
      text: `Hi ${repName},\n\nA new request has been matched to your site.\n\nRequest ID: ${request.id}\nClass: ${request.classSlug}\nRequester: ${request.requesterName}\nZip: ${request.zipCode || 'N/A'}\nPreferred dates: ${dates}`,
      html: `<p>Hi ${repName},</p><p>A new request has been matched to your site.</p><ul><li>Request ID: ${request.id}</li><li>Class: ${request.classSlug}</li><li>Requester: ${request.requesterName}</li><li>Zip: ${request.zipCode || 'N/A'}</li><li>Preferred dates: ${dates}</li></ul>`,
      replyTo,
    });
  }

  // ── Sprint 3: Event Lifecycle Emails ──────────────────────────────────────

  private generateIcsBuffer(eventDetails: {
    title: string;
    date: Date;
    location?: string;
    organizerEmail?: string;
  }): Buffer {
    // Lazy-require to avoid import issues in environments without the package
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ical = require('ical-generator');
    const calendar = ical.default
      ? ical.default({ name: 'Tech Club Event' })
      : ical({ name: 'Tech Club Event' });
    const startDate = new Date(eventDetails.date);
    const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // 2-hour default
    calendar.createEvent({
      start: startDate,
      end: endDate,
      summary: eventDetails.title,
      location: eventDetails.location || undefined,
      organizer: eventDetails.organizerEmail
        ? { name: 'The League', email: eventDetails.organizerEmail }
        : undefined,
    });
    return Buffer.from(calendar.toString(), 'utf-8');
  }

  async sendEventConfirmation(
    to: string,
    eventDetails: {
      title: string;
      date: Date;
      location?: string;
      organizerEmail?: string;
      replyTo?: string;
    },
  ): Promise<void> {
    const icsBuffer = this.generateIcsBuffer(eventDetails);
    const dateStr = new Date(eventDetails.date).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    await this.dispatch({
      to,
      subject: `Event Confirmed: ${eventDetails.title}`,
      text: `Your event "${eventDetails.title}" is confirmed for ${dateStr}${eventDetails.location ? ` at ${eventDetails.location}` : ''}. A calendar invite is attached.`,
      html: `<p>Your event "<strong>${eventDetails.title}</strong>" is confirmed for <strong>${dateStr}</strong>${eventDetails.location ? ` at ${eventDetails.location}` : ''}.</p><p>A calendar invite is attached.</p>`,
      replyTo: eventDetails.replyTo,
      attachments: [{
        filename: 'event.ics',
        content: icsBuffer,
        contentType: 'text/calendar',
      }],
    });
  }

  async sendDateChangeNotification(
    to: string,
    eventDetails: {
      title: string;
      location?: string;
      replyTo?: string;
    },
    confirmedDate: Date,
  ): Promise<void> {
    const dateStr = new Date(confirmedDate).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    await this.dispatch({
      to,
      subject: `Date Update: ${eventDetails.title}`,
      text: `The event "${eventDetails.title}" has been scheduled for ${dateStr}${eventDetails.location ? ` at ${eventDetails.location}` : ''}. This date differs from the one you selected. We hope you can still attend!`,
      html: `<p>The event "<strong>${eventDetails.title}</strong>" has been scheduled for <strong>${dateStr}</strong>${eventDetails.location ? ` at ${eventDetails.location}` : ''}.</p><p>This date differs from the one you selected. We hope you can still attend!</p>`,
      replyTo: eventDetails.replyTo,
    });
  }

  async sendCancellationNotification(
    to: string,
    eventDetails: {
      title: string;
      requestId: string;
      replyTo?: string;
    },
  ): Promise<void> {
    await this.dispatch({
      to,
      subject: `Event Cancelled: ${eventDetails.title}`,
      text: `The event "${eventDetails.title}" (Request ${eventDetails.requestId}) has been cancelled. If you have questions, please reply to this email.`,
      html: `<p>The event "<strong>${eventDetails.title}</strong>" (Request ${eventDetails.requestId}) has been cancelled.</p><p>If you have questions, please reply to this email.</p>`,
      replyTo: eventDetails.replyTo,
    });
  }

  async sendDeadlineExpiredNotification(
    to: string,
    eventDetails: {
      title: string;
      requestId: string;
      replyTo?: string;
    },
  ): Promise<void> {
    await this.dispatch({
      to,
      subject: `Voting Deadline Expired: ${eventDetails.title}`,
      text: `The voting deadline for "${eventDetails.title}" (Request ${eventDetails.requestId}) has passed without any date reaching the minimum headcount. Admin action is required — please cancel or reschedule this event.`,
      html: `<p>The voting deadline for "<strong>${eventDetails.title}</strong>" (Request ${eventDetails.requestId}) has passed without any date reaching the minimum headcount.</p><p>Admin action is required — please cancel or reschedule this event.</p>`,
      replyTo: eventDetails.replyTo,
    });
  }

  // ── Sprint 5: Equipment Readiness Emails ─────────────────────────────────

  async sendEquipmentReadyEmail(opts: {
    to: string;
    instructorName: string;
    classSlug: string;
    items: Array<{ item_type: string; quantity: number }>;
  }): Promise<void> {
    const itemList = opts.items.map((i) => `${i.quantity}× ${i.item_type}`).join(', ');
    await this.dispatch({
      to: opts.to,
      subject: `You're all set for ${opts.classSlug}`,
      text: [
        `Hi ${opts.instructorName},`,
        '',
        `Great news — you already have all the equipment you need to teach ${opts.classSlug}.`,
        '',
        `Equipment confirmed: ${itemList}`,
        '',
        'No further action is needed on your part.',
      ].join('\n'),
      html: `<p>Hi ${opts.instructorName},</p><p>Great news — you already have all the equipment you need to teach <strong>${opts.classSlug}</strong>.</p><p>Equipment confirmed: ${itemList}</p><p>No further action is needed on your part.</p>`,
    });
  }

  async sendEquipmentCheckoutPromptEmail(opts: {
    to: string;
    instructorName: string;
    classSlug: string;
    itemsNeeded: Array<{ item_type: string; quantity: number }>;
  }): Promise<void> {
    const itemList = opts.itemsNeeded.map((i) => `${i.quantity}× ${i.item_type}`).join('\n  ');
    const checkoutUrl = process.env.INVENTORY_CHECKOUT_URL;
    const checkoutLine = checkoutUrl
      ? `Please check out the items at: ${checkoutUrl}`
      : 'Please check out the required items from the inventory system.';
    await this.dispatch({
      to: opts.to,
      subject: `Action needed: check out equipment for ${opts.classSlug}`,
      text: [
        `Hi ${opts.instructorName},`,
        '',
        `To teach ${opts.classSlug}, you still need to check out the following equipment:`,
        '',
        `  ${itemList}`,
        '',
        checkoutLine,
        '',
        "You'll receive daily reminders until your checkout is confirmed.",
      ].join('\n'),
      html: `<p>Hi ${opts.instructorName},</p><p>To teach <strong>${opts.classSlug}</strong>, you still need to check out the following equipment:</p><ul>${opts.itemsNeeded.map((i) => `<li>${i.quantity}× ${i.item_type}</li>`).join('')}</ul><p>${checkoutLine}</p><p>You'll receive daily reminders until your checkout is confirmed.</p>`,
    });
  }

  async sendEquipmentCheckoutReminderEmail(opts: {
    to: string;
    instructorName: string;
    classSlug: string;
    itemsNeeded: Array<{ item_type: string; quantity: number }>;
    daysUntilEvent: number;
    reminderCount: number;
  }): Promise<void> {
    const itemList = opts.itemsNeeded.map((i) => `${i.quantity}× ${i.item_type}`).join('\n  ');
    const checkoutUrl = process.env.INVENTORY_CHECKOUT_URL;
    const checkoutLine = checkoutUrl
      ? `Please check out the items at: ${checkoutUrl}`
      : 'Please check out the required items from the inventory system.';
    const urgency = opts.daysUntilEvent <= 3 ? ' — event is soon!' : '';
    await this.dispatch({
      to: opts.to,
      subject: `Reminder (${opts.daysUntilEvent} days until event${urgency}): check out equipment for ${opts.classSlug}`,
      text: [
        `Hi ${opts.instructorName},`,
        '',
        `This is reminder #${opts.reminderCount + 1}. Your class ${opts.classSlug} is in ${opts.daysUntilEvent} day(s).`,
        '',
        'You still need to check out:',
        '',
        `  ${itemList}`,
        '',
        checkoutLine,
      ].join('\n'),
      html: `<p>Hi ${opts.instructorName},</p><p>This is reminder #${opts.reminderCount + 1}. Your class <strong>${opts.classSlug}</strong> is in <strong>${opts.daysUntilEvent} day(s)</strong>.</p><p>You still need to check out:</p><ul>${opts.itemsNeeded.map((i) => `<li>${i.quantity}× ${i.item_type}</li>`).join('')}</ul><p>${checkoutLine}</p>`,
    });
  }

  async sendNoInstructorAlertEmail(opts: {
    requestId: string;
    classTitle: string;
    requesterName: string;
    replyTo?: string;
  }): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@jointheleague.org';
    const base = process.env.APP_BASE_URL || 'http://localhost:3000';
    const detailUrl = `${base}/admin/requests/${opts.requestId}`;
    await this.dispatch({
      to: adminEmail,
      subject: `No instructor available — ${opts.classTitle}`,
      text: [
        `All instructors have declined or timed out for request ${opts.requestId}.`,
        '',
        `Class: ${opts.classTitle}`,
        `Requester: ${opts.requesterName}`,
        '',
        `View request: ${detailUrl}`,
        '',
        'Use the "Re-open matching" action in the admin dashboard to try again.',
      ].join('\n'),
      html: `<p>All instructors have declined or timed out for request <strong>${opts.requestId}</strong>.</p><ul><li>Class: ${opts.classTitle}</li><li>Requester: ${opts.requesterName}</li></ul><p><a href="${detailUrl}">View request</a></p><p>Use the "Re-open matching" action in the admin dashboard to try again.</p>`,
      replyTo: opts.replyTo,
    });
  }

  async sendRegistrationDigest(
    replyTo: string,
    threadAddress: string,
    digestHtml: string,
  ): Promise<void> {
    await this.dispatch({
      to: threadAddress,
      subject: 'Registration Summary Update',
      text: 'See attached HTML summary for current registration status.',
      html: digestHtml,
      replyTo,
    });
  }
}
