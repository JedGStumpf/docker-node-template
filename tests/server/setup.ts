// Vitest global setup — runs before all test files
process.env.NODE_ENV = 'test';
// Force SQLite for tests. Regardless of environment, tests always use SQLite.
// This is required because the Prisma client is generated from the SQLite schema
// and is not compatible with the pg adapter.
process.env.DATABASE_URL = 'file:./data/test.db';

// Initialize Prisma client so routes that use it (test-login, admin CRUD) work
import { initPrisma } from '../../server/src/services/prisma';
await initPrisma();

// Database cleanup is handled by global-setup.ts (runs once before/after all files).
