import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Load .env from project root when running locally (not in Docker).
// In Docker, env vars are set by compose/entrypoint.
// IMPORTANT: This must run BEFORE importing app modules, because auth.ts
// registers OAuth strategies at import time based on process.env values.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Dynamic imports — must come after dotenv.config() so env vars are
// available when auth.ts evaluates its OAuth strategy guards.
const { default: app } = await import('./app.js');
const { initPrisma, prisma } = await import('./services/prisma.js');
const { initConfigCache } = await import('./services/config.js');
const { ServiceRegistry } = await import('./services/service.registry.js');

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
  registry.scheduler.startTicking();

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
