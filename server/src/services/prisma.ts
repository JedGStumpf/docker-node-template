// Lazy-initialized Prisma client with dual-provider support.
// SQLite: no adapter needed. Postgres: uses @prisma/adapter-pg.
let _prisma: any;

export function isSqlite(): boolean {
  return (process.env.DATABASE_URL || '').startsWith('file:');
}

// Array fields that need JSON encode/decode in SQLite mode.
// Maps model name -> list of array field names.
const SQLITE_ARRAY_FIELDS: Record<string, string[]> = {
  InstructorProfile: ['topics', 'serviceZips'],
  EventRequest: ['preferredDates'],
};

/**
 * Encode array fields to JSON strings for SQLite write operations.
 */
function encodeArrayFields(model: string, data: Record<string, any>): Record<string, any> {
  const fields = SQLITE_ARRAY_FIELDS[model];
  if (!fields || !data) return data;
  const out = { ...data };
  for (const field of fields) {
    if (field in out && Array.isArray(out[field])) {
      out[field] = JSON.stringify(out[field]);
    }
  }
  return out;
}

/**
 * Decode JSON strings back to arrays for SQLite read operations.
 */
function decodeArrayFields(model: string, record: any): any {
  if (!record || typeof record !== 'object') return record;
  const fields = SQLITE_ARRAY_FIELDS[model];
  if (!fields) return record;
  const out = { ...record };
  for (const field of fields) {
    if (field in out && typeof out[field] === 'string') {
      try {
        out[field] = JSON.parse(out[field]);
      } catch {
        out[field] = [];
      }
    } else if (field in out && out[field] === null) {
      out[field] = [];
    }
  }
  return out;
}

/**
 * Apply array decode to a query result (handles single record or array).
 */
function decodeResult(model: string, result: any): any {
  if (Array.isArray(result)) {
    return result.map((r: any) => decodeArrayFields(model, r));
  }
  return decodeArrayFields(model, result);
}

async function getPrismaClient() {
  if (!_prisma) {
    const { PrismaClient } = await import('../generated/prisma/client');
    let client: any;
    if (isSqlite()) {
      const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
      const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
      client = new PrismaClient({ adapter });
    } else {
      const { PrismaPg } = await import('@prisma/adapter-pg');
      const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
      client = new PrismaClient({ adapter });
    }

    // In SQLite mode, wrap with query middleware to handle array field JSON encoding/decoding
    if (isSqlite()) {
      _prisma = client.$extends({
        query: {
          instructorProfile: {
            async create({ args, query }: any) {
              if (args.data) args.data = encodeArrayFields('InstructorProfile', args.data);
              const result = await query(args);
              return decodeArrayFields('InstructorProfile', result);
            },
            async update({ args, query }: any) {
              if (args.data) args.data = encodeArrayFields('InstructorProfile', args.data);
              const result = await query(args);
              return decodeArrayFields('InstructorProfile', result);
            },
            async upsert({ args, query }: any) {
              if (args.create) args.create = encodeArrayFields('InstructorProfile', args.create);
              if (args.update) args.update = encodeArrayFields('InstructorProfile', args.update);
              const result = await query(args);
              return decodeArrayFields('InstructorProfile', result);
            },
            async findUnique({ args, query }: any) {
              const result = await query(args);
              return decodeArrayFields('InstructorProfile', result);
            },
            async findFirst({ args, query }: any) {
              const result = await query(args);
              return decodeArrayFields('InstructorProfile', result);
            },
            async findMany({ args, query }: any) {
              const results = await query(args);
              return decodeResult('InstructorProfile', results);
            },
          },
          eventRequest: {
            async create({ args, query }: any) {
              if (args.data) args.data = encodeArrayFields('EventRequest', args.data);
              const result = await query(args);
              return decodeArrayFields('EventRequest', result);
            },
            async update({ args, query }: any) {
              if (args.data) args.data = encodeArrayFields('EventRequest', args.data);
              const result = await query(args);
              return decodeArrayFields('EventRequest', result);
            },
            async upsert({ args, query }: any) {
              if (args.create) args.create = encodeArrayFields('EventRequest', args.create);
              if (args.update) args.update = encodeArrayFields('EventRequest', args.update);
              const result = await query(args);
              return decodeArrayFields('EventRequest', result);
            },
            async findUnique({ args, query }: any) {
              const result = await query(args);
              return decodeArrayFields('EventRequest', result);
            },
            async findFirst({ args, query }: any) {
              const result = await query(args);
              return decodeArrayFields('EventRequest', result);
            },
            async findMany({ args, query }: any) {
              const results = await query(args);
              return decodeResult('EventRequest', results);
            },
          },
        },
      });
    } else {
      _prisma = client;
    }
  }
  return _prisma;
}

// Proxy that forwards all property access to the lazily-initialized client.
// This lets consuming code use `prisma.model.method()` synchronously after
// the app has started (the server init awaits getPrismaClient first).
export const prisma = new Proxy({} as any, {
  get(_target, prop) {
    if (!_prisma) {
      throw new Error(
        'Prisma client not initialized. Call initPrisma() before using the client.'
      );
    }
    return (_prisma as any)[prop];
  },
});

export async function initPrisma() {
  await getPrismaClient();
}
