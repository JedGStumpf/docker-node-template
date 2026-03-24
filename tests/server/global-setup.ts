/**
 * Vitest globalSetup — runs exactly once before all test files start
 * and once after all test files finish.
 * Used for database cleanup so test data doesn't accumulate across runs.
 */

const connectionString = process.env.DATABASE_URL || 'file:./data/test.db';
const isSqlite = connectionString.startsWith('file:');

async function cleanupSqlite() {
  const Database = (await import('better-sqlite3')).default;
  const dbPath = connectionString.replace('file:', '');
  let db;
  try {
    db = new Database(dbPath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const tableNames = tables.map((t) => t.name).filter((n) => n !== '_prisma_migrations' && n !== 'sqlite_sequence');
    for (const table of tableNames) {
      db.prepare(`DELETE FROM "${table}"`).run();
    }
  } catch {
    // DB file may not exist yet
  } finally {
    db?.close();
  }
}

async function cleanupPostgres() {
  const pg = (await import('pg')).default;
  const pool = new pg.Pool({ connectionString });
  try {
    const testEmailPattern = `email LIKE '%@example.com' OR email LIKE '%@test.com'`;
    await pool.query(`DELETE FROM "Message" WHERE "authorId" IN (SELECT id FROM "User" WHERE ${testEmailPattern})`).catch(() => {});
    await pool.query(`DELETE FROM "UserProvider" WHERE "userId" IN (SELECT id FROM "User" WHERE ${testEmailPattern})`).catch(() => {});
    await pool.query(`DELETE FROM "RoleAssignmentPattern" WHERE pattern LIKE '%@example.com' OR pattern LIKE '%@test.com'`).catch(() => {});
    await pool.query(`DELETE FROM "User" WHERE ${testEmailPattern}`);
    await pool.query(`DELETE FROM "Channel" WHERE name ~ '[0-9]{10,}'`).catch(() => {});
  } catch {
    // Tables may not exist yet
  } finally {
    await pool.end();
  }
}

async function cleanup() {
  if (isSqlite) {
    await cleanupSqlite();
  } else {
    await cleanupPostgres();
  }
}

export async function setup() {
  await cleanup();
}

export async function teardown() {
  await cleanup();
}
