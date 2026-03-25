// Vitest global setup — runs before all test files
process.env.NODE_ENV = 'test';
// Force SQLite for tests. Regardless of environment, tests always use SQLite.
// This is required because the Prisma client is generated from the SQLite schema
// and is not compatible with the pg adapter.
process.env.DATABASE_URL = 'file:./data/test.db';

// Point ContentService at the local test fixture so class-slug validation works
// in tests (must be set before app.ts is imported so ServiceRegistry captures it).
import path from 'path';
import { fileURLToPath } from 'url';
const __setupFilename = fileURLToPath(import.meta.url);
const __setupDirname = path.dirname(__setupFilename);
const CONTENT_FIXTURE = path.resolve(__setupDirname, '../fixtures/content.json');
process.env.CONTENT_JSON_URL = `file://${CONTENT_FIXTURE}`;

// Initialize Prisma client so routes that use it (test-login, admin CRUD) work
import { initPrisma } from '../../server/src/services/prisma';
await initPrisma();

// Database cleanup is handled by global-setup.ts (runs once before/after all files).
