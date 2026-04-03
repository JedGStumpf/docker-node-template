import './env.js';
import app from './app.js';
import { initPrisma } from './services/prisma.js';
import { initConfigCache } from './services/config.js';
import { ServiceRegistry } from './services/service.registry.js';
import { prisma } from './services/prisma.js';

const port = parseInt(process.env.PORT || '3000', 10);

const registry = ServiceRegistry.create();

initPrisma().then(() => initConfigCache()).then(async () => {
  // Seed default general channel (idempotent)
  await prisma.channel.upsert({
    where: { name: 'general' },
    update: {},
    create: { name: 'general', description: 'General discussion' },
  });

  await registry.scheduler.seedDefaults();
  registry.scheduler.registerHandler('daily-backup', async () => {
    await registry.backups.createBackup();
  });
  registry.scheduler.registerHandler('weekly-backup', async () => {
    await registry.backups.createBackup();
  });
  registry.scheduler.registerHandler('assignment-reminders', async () => {
    await registry.instructors.sendReminders(registry.email, registry.matching);
  });
  registry.scheduler.registerHandler('registration-digest', async () => {
    const requests = await prisma.eventRequest.findMany({
      where: { status: 'dates_proposed' },
      include: { registrations: true },
    });
    for (const req of requests) {
      if (!req.emailThreadAddress) continue;
      if (!req.registrations || req.registrations.length === 0) continue;
      const proposedDates: string[] = Array.isArray(req.proposedDates) ? req.proposedDates : [];
      const digestHtml = registry.registration.generateDigest(req.registrations, proposedDates);
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@jointheleague.org';
      await registry.email.sendRegistrationDigest(adminEmail, req.emailThreadAddress, digestHtml);
    }
  });
  registry.scheduler.registerHandler('deadline-check', async () => {
    const now = new Date();
    const expiredRequests = await prisma.eventRequest.findMany({
      where: {
        status: 'dates_proposed',
        votingDeadline: { lt: now },
      },
    });
    for (const req of expiredRequests) {
      const result = await registry.registration.checkAndFinalizeThreshold(req.id);
      if (!result) {
        // No date met threshold — notify requester and admin
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@jointheleague.org';
        const eventDetails = {
          title: req.classSlug,
          requestId: req.id,
          replyTo: req.emailThreadAddress || undefined,
        };
        if (req.requesterEmail) {
          await registry.email.sendDeadlineExpiredNotification(req.requesterEmail, eventDetails);
        }
        await registry.email.sendDeadlineExpiredNotification(adminEmail, eventDetails);
      }
    }
  });
  // Sprint 4: Email queue sender — runs hourly
  registry.scheduler.registerHandler('email-sender', async () => {
    const transport = registry.email.getTransport();
    await registry.emailQueue.processPending(transport, 20);
  });
  // Sprint 4: Meetup RSVP sync — daily
  registry.scheduler.registerHandler('meetup-rsvp-sync', async () => {
    const now = new Date();
    const requests = await prisma.eventRequest.findMany({
      where: {
        status: 'confirmed',
        groupType: 'public',
        meetupEventId: { not: null },
        confirmedDate: { gt: now },
      },
    });
    for (const req of requests) {
      try {
        await registry.meetup.syncRsvps(req.id);
      } catch (err) {
        console.error(`meetup-rsvp-sync: failed for request ${req.id}`, err);
      }
    }
  });
  registry.scheduler.startTicking();

  // Sprint 1: Background jobs — not registered in test env
  if (process.env.NODE_ENV !== 'test') {
    const expiryIntervalMs = Number(process.env.REQUEST_EXPIRY_INTERVAL_MS) || 5 * 60 * 1000;
    setInterval(async () => {
      try {
        await registry.requests.expireUnverified();
      } catch (err) {
        console.error('expireUnverified job failed:', err);
      }
    }, expiryIntervalMs);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
});

const shutdown = () => {
  registry.scheduler.stopTicking();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
