/**
 * EmailService — outbound-only email dispatch for Sprint 1.
 *
 * Uses an injectable transport interface so tests can capture sent messages
 * without making real SES calls.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
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
      });
    } catch (err) {
      console.error('EmailService: failed to send email', err);
      // Degrade gracefully — do not throw
    }
  }
}

export class EmailService {
  constructor(private transport: IEmailTransport) {}

  async sendVerificationEmail(opts: {
    to: string;
    requestId: string;
    token: string;
    baseUrl?: string;
  }): Promise<void> {
    const base = opts.baseUrl || process.env.APP_BASE_URL || 'http://localhost:3000';
    const link = `${base}/api/requests/${opts.requestId}/verify?token=${opts.token}`;
    await this.transport.send({
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
  }): Promise<void> {
    const base = opts.baseUrl || process.env.APP_BASE_URL || 'http://localhost:3000';
    const acceptUrl = `${base}/api/instructor/assignments/${opts.assignmentId}/accept?token=${opts.notificationToken}`;
    const declineUrl = `${base}/api/instructor/assignments/${opts.assignmentId}/decline?token=${opts.notificationToken}`;
    const datesStr = opts.preferredDates.join(', ');
    await this.transport.send({
      to: opts.to,
      subject: `New Tech Club event request — ${opts.classTitle}`,
      text: `A new event request has been matched to you.\n\nClass: ${opts.classTitle}\nRequester: ${opts.requesterName}\nZip: ${opts.zipCode}\nPreferred dates: ${datesStr}\n\nAccept: ${acceptUrl}\nDecline: ${declineUrl}`,
      html: `<p>A new event request has been matched to you.</p><ul><li>Class: ${opts.classTitle}</li><li>Requester: ${opts.requesterName}</li><li>Zip: ${opts.zipCode}</li><li>Preferred dates: ${datesStr}</li></ul><p><a href="${acceptUrl}">Accept</a> | <a href="${declineUrl}">Decline</a></p>`,
    });
  }

  async sendMatchReminder(opts: {
    to: string;
    assignmentId: string;
    notificationToken: string;
    requestId: string;
    classTitle: string;
    baseUrl?: string;
  }): Promise<void> {
    const base = opts.baseUrl || process.env.APP_BASE_URL || 'http://localhost:3000';
    const acceptUrl = `${base}/api/instructor/assignments/${opts.assignmentId}/accept?token=${opts.notificationToken}`;
    const declineUrl = `${base}/api/instructor/assignments/${opts.assignmentId}/decline?token=${opts.notificationToken}`;
    await this.transport.send({
      to: opts.to,
      subject: `Reminder: Tech Club event request — ${opts.classTitle}`,
      text: `This is a reminder that you have a pending event request.\n\nClass: ${opts.classTitle}\n\nAccept: ${acceptUrl}\nDecline: ${declineUrl}`,
      html: `<p>This is a reminder that you have a pending event request.</p><p>Class: ${opts.classTitle}</p><p><a href="${acceptUrl}">Accept</a> | <a href="${declineUrl}">Decline</a></p>`,
    });
  }

  async sendAdminNewRequestNotification(opts: {
    requestId: string;
    classTitle: string;
    requesterName: string;
    noMatchAvailable?: boolean;
  }): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@jointheleague.org';
    const subject = opts.noMatchAvailable
      ? `No instructor match available — ${opts.classTitle}`
      : `New Tech Club event request — ${opts.classTitle}`;
    const body = opts.noMatchAvailable
      ? `No available instructors were found for request ${opts.requestId} (${opts.classTitle} from ${opts.requesterName}). Manual assignment needed.`
      : `A new event request has been submitted. Request ID: ${opts.requestId}. Class: ${opts.classTitle}. Requester: ${opts.requesterName}.`;
    await this.transport.send({
      to: adminEmail,
      subject,
      text: body,
    });
  }
}
