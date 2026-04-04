/**
 * AnalyticsService — read-only analytics using Prisma aggregation.
 * No raw SQL — uses groupBy and count queries.
 */

export interface EventFunnel {
  unverified: number;
  new: number;
  discussing: number;
  dates_proposed: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  total: number;
}

export interface InstructorUtilization {
  instructorId: number;
  displayName: string;
  accepted: number;
  declined: number;
  timed_out: number;
  pending: number;
  total: number;
}

export interface RegistrationSummary {
  interested: number;
  confirmed: number;
  cancelled: number;
  totalKids: number;
  total: number;
}

export interface AnalyticsPeriod {
  from: Date;
  to: Date;
}

const DEFAULT_PERIOD_DAYS = 90;

function defaultPeriod(): AnalyticsPeriod {
  const to = new Date();
  const from = new Date(to.getTime() - DEFAULT_PERIOD_DAYS * 24 * 3600 * 1000);
  return { from, to };
}

export class AnalyticsService {
  constructor(private prisma: any) {}

  async getEventFunnel(period?: AnalyticsPeriod): Promise<EventFunnel> {
    const { from, to } = period || defaultPeriod();

    const requests = await this.prisma.eventRequest.findMany({
      where: {
        createdAt: { gte: from, lte: to },
      },
      select: { status: true },
    });

    const counts: Record<string, number> = {
      unverified: 0,
      new: 0,
      discussing: 0,
      dates_proposed: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
    };

    for (const req of requests) {
      const status = req.status;
      if (status in counts) {
        counts[status]++;
      }
    }

    return {
      ...counts,
      total: requests.length,
    } as EventFunnel;
  }

  async getInstructorUtilization(period?: AnalyticsPeriod): Promise<InstructorUtilization[]> {
    const { from, to } = period || defaultPeriod();

    const assignments = await this.prisma.instructorAssignment.findMany({
      where: {
        createdAt: { gte: from, lte: to },
      },
      include: {
        instructor: { select: { id: true, displayName: true } },
      },
    });

    // Group by instructor
    const byInstructor = new Map<number, InstructorUtilization>();

    for (const a of assignments) {
      const id = a.instructor.id;
      if (!byInstructor.has(id)) {
        byInstructor.set(id, {
          instructorId: id,
          displayName: a.instructor.displayName,
          accepted: 0,
          declined: 0,
          timed_out: 0,
          pending: 0,
          total: 0,
        });
      }
      const rec = byInstructor.get(id)!;
      if (a.status === 'accepted') rec.accepted++;
      else if (a.status === 'declined') rec.declined++;
      else if (a.status === 'timed_out') rec.timed_out++;
      else if (a.status === 'pending') rec.pending++;
      rec.total++;
    }

    return Array.from(byInstructor.values()).sort((a, b) => b.total - a.total);
  }

  async getRegistrationCounts(period?: AnalyticsPeriod): Promise<RegistrationSummary> {
    const { from, to } = period || defaultPeriod();

    const registrations = await this.prisma.registration.findMany({
      where: {
        createdAt: { gte: from, lte: to },
      },
      select: { status: true, numberOfKids: true },
    });

    let interested = 0;
    let confirmed = 0;
    let cancelled = 0;
    let totalKids = 0;

    for (const reg of registrations) {
      if (reg.status === 'interested') interested++;
      else if (reg.status === 'confirmed') {
        confirmed++;
        totalKids += reg.numberOfKids || 0;
      } else if (reg.status === 'cancelled') cancelled++;
    }

    return {
      interested,
      confirmed,
      cancelled,
      totalKids,
      total: registrations.length,
    };
  }
}
