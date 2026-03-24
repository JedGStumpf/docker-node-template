/**
 * Test database helper.
 * Uses Prisma client for direct DB access in tests.
 */
import { prisma } from '../../../server/src/services/prisma';

export async function cleanupTestDb() {
  try {
    const testEmails = ['@example.com', '@test.com'];

    // Find test users
    const testUsers = await prisma.user.findMany({
      where: {
        OR: testEmails.map(suffix => ({
          email: { endsWith: suffix },
        })),
      },
      select: { id: true },
    });
    const userIds = testUsers.map((u: any) => u.id);

    if (userIds.length > 0) {
      // Delete related records first (FK constraints)
      await prisma.message.deleteMany({
        where: { authorId: { in: userIds } },
      });
      await prisma.userProvider.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }

    // Clean up test role assignment patterns
    await prisma.roleAssignmentPattern.deleteMany({
      where: {
        OR: testEmails.map(suffix => ({
          pattern: { endsWith: suffix },
        })),
      },
    });

    // Clean up test channels (names containing long numeric strings)
    // Use a broad approach: delete channels created during tests
    const channels = await prisma.channel.findMany();
    const testChannelIds = channels
      .filter((c: any) => /[0-9]{10,}/.test(c.name))
      .map((c: any) => c.id);
    if (testChannelIds.length > 0) {
      await prisma.message.deleteMany({
        where: { channelId: { in: testChannelIds } },
      });
      await prisma.channel.deleteMany({
        where: { id: { in: testChannelIds } },
      });
    }
  } catch {
    // Tables may not exist yet
  }
}

export async function findUserByEmail(email: string) {
  return prisma.user.findFirst({ where: { email } });
}

export async function findUserById(id: number) {
  return prisma.user.findFirst({ where: { id } });
}
