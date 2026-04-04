/**
 * Dev seed script — Sprint 006
 *
 * Creates the following idempotent dev data:
 *
 *  Channel:
 *    - "general" — default discussion channel
 *
 *  InstructorProfile (3):
 *    - Alice Chen    — python/scratch topics, San Diego (92101)
 *    - Bob Martinez  — robotics topics,       Beverly Hills (90210)
 *    - Carol Park    — game-design/js topics, New York (10001)
 *
 *  RegisteredSite (2):
 *    - Mission Valley Library    — San Diego, CA 92108
 *    - Lincoln Elementary School — San Diego, CA 92103
 *
 *  User (1):
 *    - admin@jointheleague.org — role ADMIN
 *
 * Run with: npx prisma db seed
 * Safe to run multiple times — all operations are upserts (or findFirst+create).
 */

async function createPrisma() {
  const { PrismaClient } = await import('../src/generated/prisma/client.js');
  const url = process.env.DATABASE_URL ?? '';
  if (url.startsWith('file:')) {
    const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
    const adapter = new PrismaBetterSqlite3({ url });
    return new PrismaClient({ adapter });
  } else {
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const adapter = new PrismaPg({ connectionString: url });
    return new PrismaClient({ adapter });
  }
}

async function main() {
  const client = await createPrisma();
  const isSqlite = (process.env.DATABASE_URL ?? '').startsWith('file:');

  // Cast to any to bypass Prisma generated type constraints.
  // The seed script does not use the $extends middleware layer, so array
  // fields (topics, serviceZips) must be JSON-encoded manually for SQLite.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = client;

  // Encode string arrays as JSON strings for SQLite; pass through for Postgres.
  function arr(values: string[]): unknown {
    return isSqlite ? JSON.stringify(values) : values;
  }

  try {
    // ------------------------------------------------------------------ //
    // Channel: general
    // ------------------------------------------------------------------ //
    const general = await db.channel.upsert({
      where: { name: 'general' },
      update: {},
      create: { name: 'general', description: 'General discussion' },
    });
    console.log(`Seed: channel "${general.name}" (id=${general.id})`);

    // ------------------------------------------------------------------ //
    // InstructorProfiles (3)
    // ------------------------------------------------------------------ //
    const instructors = [
      {
        pike13UserId: 'seed-instructor-001',
        displayName: 'Alice Chen',
        email: 'alice.chen@jointheleague.org',
        homeZip: '92101',
        topics: arr(['python', 'scratch', 'programming']),
        serviceZips: arr(['92101', '92103', '92108', '92110', '92115']),
        maxTravelMinutes: 120,
      },
      {
        pike13UserId: 'seed-instructor-002',
        displayName: 'Bob Martinez',
        email: 'bob.martinez@jointheleague.org',
        homeZip: '90210',
        topics: arr(['robotics', 'engineering']),
        serviceZips: arr(['90210', '90024', '90048', '90034', '90230']),
        maxTravelMinutes: 120,
      },
      {
        pike13UserId: 'seed-instructor-003',
        displayName: 'Carol Park',
        email: 'carol.park@jointheleague.org',
        homeZip: '10001',
        topics: arr(['game-design', 'javascript', 'web-design', 'data-science']),
        serviceZips: arr(['10001', '10002', '10003', '10010', '10011']),
        maxTravelMinutes: 120,
      },
    ];

    for (const inst of instructors) {
      const upserted = await db.instructorProfile.upsert({
        where: { pike13UserId: inst.pike13UserId },
        update: {
          displayName: inst.displayName,
          email: inst.email,
          homeZip: inst.homeZip,
          topics: inst.topics,
          serviceZips: inst.serviceZips,
          maxTravelMinutes: inst.maxTravelMinutes,
          active: true,
        },
        create: {
          pike13UserId: inst.pike13UserId,
          displayName: inst.displayName,
          email: inst.email,
          homeZip: inst.homeZip,
          topics: inst.topics,
          serviceZips: inst.serviceZips,
          maxTravelMinutes: inst.maxTravelMinutes,
          active: true,
        },
      });
      console.log(`Seed: instructor "${upserted.displayName}" (id=${upserted.id}, zip=${inst.homeZip})`);
    }

    // ------------------------------------------------------------------ //
    // RegisteredSites (2)
    // RegisteredSite has no unique field besides id — use findFirst + create.
    // ------------------------------------------------------------------ //
    const sites = [
      {
        name: 'Mission Valley Library',
        address: '2123 Fenton Pkwy',
        city: 'San Diego',
        state: 'CA',
        zipCode: '92108',
        capacity: 30,
        roomNotes: 'Community room B — requires laptop cart reservation',
      },
      {
        name: 'Lincoln Elementary School',
        address: '1385 W Washington St',
        city: 'San Diego',
        state: 'CA',
        zipCode: '92103',
        capacity: 25,
        roomNotes: 'Computer lab — 25 student stations',
      },
    ];

    for (const site of sites) {
      const existing = await db.registeredSite.findFirst({ where: { name: site.name } });
      if (existing) {
        console.log(`Seed: site "${existing.name}" already exists (id=${existing.id})`);
      } else {
        const created = await db.registeredSite.create({ data: { ...site, active: true } });
        console.log(`Seed: site "${created.name}" (id=${created.id})`);
      }
    }

    // ------------------------------------------------------------------ //
    // Admin User (1)
    // ------------------------------------------------------------------ //
    const admin = await db.user.upsert({
      where: { email: 'admin@jointheleague.org' },
      update: { role: 'ADMIN', displayName: 'League Admin' },
      create: {
        email: 'admin@jointheleague.org',
        displayName: 'League Admin',
        role: 'ADMIN',
        provider: 'seed',
        providerId: 'seed-admin-001',
      },
    });
    console.log(`Seed: admin user "${admin.email}" (id=${admin.id}, role=${admin.role})`);

    console.log('\nSeed complete.');
  } finally {
    await client.$disconnect();
  }
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
