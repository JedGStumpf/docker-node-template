/**
 * InstructorService — manages InstructorProfile records and assignment lifecycle.
 */

import { ServiceError } from '../errors';

export interface InstructorProfileInput {
  pike13UserId: string;
  displayName: string;
  email: string;
  topics: string[];
  homeZip: string;
  maxTravelMinutes: number;
  serviceZips?: string[];
  active?: boolean;
}

export class InstructorService {
  private equipmentService?: any;

  constructor(private prisma: any) {}

  /** Inject EquipmentService to avoid circular dependency at construction time. */
  setEquipmentService(equipmentService: any) {
    this.equipmentService = equipmentService;
  }

  async getProfile(pike13UserId: string) {
    return this.prisma.instructorProfile.findUnique({
      where: { pike13UserId },
    });
  }

  async upsertProfile(input: InstructorProfileInput) {
    // Validate required fields
    if (!input.topics || input.topics.length === 0) {
      throw new ServiceError('topics must be a non-empty array', 422);
    }
    if (!input.homeZip || !/^\d{5}$/.test(input.homeZip)) {
      throw new ServiceError('homeZip must be a valid 5-digit zip code', 422);
    }
    if (!input.maxTravelMinutes || input.maxTravelMinutes <= 0) {
      throw new ServiceError('maxTravelMinutes must be a positive integer', 422);
    }

    return this.prisma.instructorProfile.upsert({
      where: { pike13UserId: input.pike13UserId },
      update: {
        displayName: input.displayName,
        email: input.email,
        topics: input.topics,
        homeZip: input.homeZip,
        maxTravelMinutes: input.maxTravelMinutes,
        serviceZips: input.serviceZips || [],
        active: input.active !== undefined ? input.active : true,
      },
      create: {
        pike13UserId: input.pike13UserId,
        displayName: input.displayName,
        email: input.email,
        topics: input.topics,
        homeZip: input.homeZip,
        maxTravelMinutes: input.maxTravelMinutes,
        serviceZips: input.serviceZips || [],
        active: input.active !== undefined ? input.active : true,
      },
    });
  }

  async handleAssignmentResponse(
    assignmentId: string,
    token: string,
    response: 'accept' | 'decline',
  ) {
    const assignment = await this.prisma.instructorAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) {
      throw new ServiceError('Assignment not found', 404);
    }
    if (assignment.notificationToken !== token) {
      throw new ServiceError('Invalid notification token', 400);
    }

    // Idempotent: if already in terminal state, return as-is
    if (response === 'accept' && assignment.status === 'accepted') {
      return assignment;
    }
    if (response === 'decline' && assignment.status === 'declined') {
      return assignment;
    }

    const newStatus = response === 'accept' ? 'accepted' : 'declined';
    const updated = await this.prisma.instructorAssignment.update({
      where: { id: assignmentId },
      data: {
        status: newStatus,
        respondedAt: new Date(),
      },
    });

    // Denormalise: set assignedInstructorId on EventRequest
    if (response === 'accept') {
      await this.prisma.eventRequest.update({
        where: { id: assignment.requestId },
        data: { assignedInstructorId: assignment.instructorId },
      });

      // Fire-and-forget equipment readiness check
      if (this.equipmentService) {
        this.equipmentService.checkReadiness(assignmentId).catch((err: any) => {
          console.error(`EquipmentService.checkReadiness failed for ${assignmentId}:`, err);
        });
      }
    }

    return updated;
  }

  async sendReminders(emailService: any, matchingService: any) {
    const reminderIntervalHours =
      Number(process.env.INSTRUCTOR_REMINDER_INTERVAL_HOURS) || 8;
    const timeoutHours =
      Number(process.env.INSTRUCTOR_TIMEOUT_HOURS) || 24;
    const maxReminders = Math.floor(timeoutHours / reminderIntervalHours);

    const now = new Date();
    const pendingAssignments = await this.prisma.instructorAssignment.findMany({
      where: { status: 'pending' },
      include: {
        instructor: true,
        request: true,
      },
    });

    for (const assignment of pendingAssignments) {
      // Use timeoutAt for timeout detection (Sprint 3 enhancement)
      const isTimedOut = assignment.timeoutAt
        ? new Date(assignment.timeoutAt) < now
        : (() => {
            const firstNotifiedAt = assignment.notifiedAt || assignment.createdAt;
            const totalElapsedHours =
              (now.getTime() - new Date(firstNotifiedAt).getTime()) / (1000 * 60 * 60);
            return totalElapsedHours >= timeoutHours;
          })();

      if (isTimedOut) {
        // Mark as timed out and advance to next instructor
        await this.prisma.instructorAssignment.update({
          where: { id: assignment.id },
          data: { status: 'timed_out', respondedAt: now },
        });
        await this.advanceToNextInstructor(assignment, emailService, matchingService);
        continue;
      }

      // Check if reminder is due
      const lastActivity = assignment.lastReminderAt || assignment.notifiedAt || assignment.createdAt;
      const hoursSinceLast =
        (now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60);

      if (
        hoursSinceLast >= reminderIntervalHours &&
        assignment.reminderCount < maxReminders
      ) {
        // Send reminder
        try {
          await emailService.sendMatchReminder({
            to: assignment.instructor.email,
            assignmentId: assignment.id,
            notificationToken: assignment.notificationToken,
            requestId: assignment.requestId,
            classTitle: assignment.request.classSlug,
          });
          await this.prisma.instructorAssignment.update({
            where: { id: assignment.id },
            data: {
              reminderCount: assignment.reminderCount + 1,
              lastReminderAt: now,
            },
          });
        } catch {
          // Continue even if one reminder fails
        }
      }
    }
  }

  async advanceToNextInstructor(
    currentAssignment: any,
    emailService: any,
    matchingService: any,
  ) {
    const request = await this.prisma.eventRequest.findUnique({
      where: { id: currentAssignment.requestId },
      include: { assignments: true },
    });
    if (!request) return;

    // Get all instructor IDs that have already been tried
    const triedIds = request.assignments.map((a: any) => a.instructorId);

    // Find next candidate
    const { candidates } = await matchingService.findMatchingInstructors({
      zip: request.zipCode,
      classSlug: request.classSlug,
      excludeInstructorIds: triedIds,
    });

    if (!candidates || candidates.length === 0) {
      // No more candidates — transition to no_instructor and alert admin
      await this.prisma.eventRequest.update({
        where: { id: request.id },
        data: { status: 'no_instructor' },
      });
      await emailService.sendNoInstructorAlertEmail({
        requestId: request.id,
        classTitle: request.classSlug,
        requesterName: request.requesterName,
        replyTo: request.emailThreadAddress || undefined,
      });
      return;
    }

    // Create new assignment for next candidate
    const next = candidates[0];
    const notificationToken = crypto.randomUUID();
    const assignmentTimeoutHours = Number(process.env.ASSIGNMENT_TIMEOUT_HOURS) || 48;
    const newAssignment = await this.prisma.instructorAssignment.create({
      data: {
        requestId: request.id,
        instructorId: next.instructorId,
        status: 'pending',
        notificationToken,
        notifiedAt: new Date(),
        timeoutAt: new Date(Date.now() + assignmentTimeoutHours * 3600_000),
      },
    });

    // Get instructor details
    const instructor = await this.prisma.instructorProfile.findUnique({
      where: { id: next.instructorId },
    });

    // Send notification email
    const preferredDates: string[] = Array.isArray(request.preferredDates)
      ? request.preferredDates
      : [];

    try {
      await emailService.sendMatchNotification({
        to: next.email,
        assignmentId: newAssignment.id,
        notificationToken,
        requestId: request.id,
        classTitle: request.classSlug,
        requesterName: request.requesterName,
        zipCode: request.zipCode,
        preferredDates,
        replyTo: request.emailThreadAddress || undefined,
      });
    } catch {
      // Continue even if email fails
    }
  }
}
