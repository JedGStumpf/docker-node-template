/**
 * EquipmentService — checks instructor equipment readiness on assignment acceptance.
 *
 * Flow:
 * 1. Load assignment + instructor profile + event request.
 * 2. If inventoryUserId is null → set status = "unknown", log, return.
 * 3. Parse equipmentNeeded from ContentService.
 * 4. Call inventoryClient.getCheckouts(). If it throws → set status = "unknown", log, return.
 * 5. Compute itemsStillNeeded (required − checked-out).
 * 6. If empty → set status = "ready", enqueue confirmation email.
 * 7. If non-empty → set status = "pending_checkout", enqueue prompt email.
 */

import type { IInventoryClient, CheckoutItem } from './inventory';
import type { ContentService } from './content.service';
import type { EmailService } from './email.service';

export interface EquipmentItem {
  item_type: string;
  quantity: number;
}

export class EquipmentService {
  constructor(
    private prisma: any,
    private inventoryClient: IInventoryClient,
    private content: ContentService,
    private email: EmailService,
  ) {}

  /**
   * Parse an array of equipment-needed strings into structured items.
   * Strings like "2 EV3 Robot Kit" or "15× micro:bit" are parsed best-effort.
   * Returns null if parsing yields no items.
   */
  parseEquipmentNeeded(equipmentNeeded: string[] | undefined): EquipmentItem[] | null {
    if (!equipmentNeeded || equipmentNeeded.length === 0) return null;

    const items: EquipmentItem[] = [];
    for (const raw of equipmentNeeded) {
      // Match patterns like: "2 EV3 Robot Kit", "15x micro:bit", "15× micro:bit"
      const match = raw.match(/^(\d+)\s*[x×]?\s*(.+)$/i);
      if (match) {
        items.push({ item_type: match[2].trim(), quantity: parseInt(match[1], 10) });
      } else {
        // No quantity prefix — treat as quantity 1
        items.push({ item_type: raw.trim(), quantity: 1 });
      }
    }

    return items.length > 0 ? items : null;
  }

  /**
   * Compute items still needed: required items minus checked-out items by type.
   */
  computeStillNeeded(required: EquipmentItem[], checkedOut: CheckoutItem[]): EquipmentItem[] {
    const still: EquipmentItem[] = [];
    for (const req of required) {
      const out = checkedOut
        .filter((c) => c.item_type.toLowerCase() === req.item_type.toLowerCase())
        .reduce((sum, c) => sum + c.quantity, 0);
      const diff = req.quantity - out;
      if (diff > 0) {
        still.push({ item_type: req.item_type, quantity: diff });
      }
    }
    return still;
  }

  /**
   * Run the equipment readiness check for an assignment.
   * Sets equipmentStatus on the assignment and enqueues appropriate emails.
   */
  async checkReadiness(assignmentId: string): Promise<void> {
    const assignment = await this.prisma.instructorAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        instructor: true,
        request: true,
      },
    });

    if (!assignment) {
      console.warn(`EquipmentService: assignment ${assignmentId} not found`);
      return;
    }

    const { instructor, request } = assignment;

    // Step 2: Check inventoryUserId
    if (!instructor.inventoryUserId) {
      console.warn(
        `EquipmentService: instructor ${instructor.id} has no inventoryUserId — status unknown`,
      );
      await this.prisma.instructorAssignment.update({
        where: { id: assignmentId },
        data: { equipmentStatus: 'unknown', equipmentCheckedAt: new Date() },
      });
      return;
    }

    // Step 3: Load equipment needed from content
    let classRecord: any = null;
    try {
      classRecord = await this.content.getClassBySlug(request.classSlug);
    } catch {
      // Ignore fetch errors
    }

    const required = this.parseEquipmentNeeded(classRecord?.equipmentNeeded);
    if (!required) {
      console.warn(
        `EquipmentService: no equipmentNeeded for class ${request.classSlug} — status unknown`,
      );
      await this.prisma.instructorAssignment.update({
        where: { id: assignmentId },
        data: { equipmentStatus: 'unknown', equipmentCheckedAt: new Date() },
      });
      return;
    }

    // Step 4: Query inventory
    let checkedOut: CheckoutItem[] = [];
    try {
      checkedOut = await this.inventoryClient.getCheckouts(instructor.inventoryUserId);
    } catch (err: any) {
      console.error(
        `EquipmentService: inventory client error for instructor ${instructor.id}: ${err.message}`,
      );
      await this.prisma.instructorAssignment.update({
        where: { id: assignmentId },
        data: { equipmentStatus: 'unknown', equipmentCheckedAt: new Date() },
      });
      return;
    }

    // Step 5: Compute still needed
    const stillNeeded = this.computeStillNeeded(required, checkedOut);
    const now = new Date();

    if (stillNeeded.length === 0) {
      // Already equipped
      await this.prisma.instructorAssignment.update({
        where: { id: assignmentId },
        data: { equipmentStatus: 'ready', equipmentCheckedAt: now },
      });

      await this.email.sendEquipmentReadyEmail({
        to: instructor.email,
        instructorName: instructor.displayName,
        classSlug: request.classSlug,
        items: required,
      });
    } else {
      // Gear still needed
      await this.prisma.instructorAssignment.update({
        where: { id: assignmentId },
        data: { equipmentStatus: 'pending_checkout', equipmentCheckedAt: now },
      });

      await this.email.sendEquipmentCheckoutPromptEmail({
        to: instructor.email,
        instructorName: instructor.displayName,
        classSlug: request.classSlug,
        itemsNeeded: stillNeeded,
      });
    }
  }

  /**
   * Get full equipment status details for an assignment.
   */
  async getEquipmentStatus(assignmentId: string): Promise<{
    status: string;
    required: EquipmentItem[];
    checked_out: CheckoutItem[];
    still_needed: EquipmentItem[];
    last_checked_at: Date | null;
    reminder_count: number;
  } | null> {
    const assignment = await this.prisma.instructorAssignment.findUnique({
      where: { id: assignmentId },
      include: { instructor: true, request: true },
    });

    if (!assignment) return null;

    const { instructor, request } = assignment;

    // If no inventoryUserId or status is unknown, return minimal info
    if (!instructor.inventoryUserId || assignment.equipmentStatus === 'unknown') {
      return {
        status: assignment.equipmentStatus,
        required: [],
        checked_out: [],
        still_needed: [],
        last_checked_at: assignment.equipmentCheckedAt,
        reminder_count: assignment.equipmentReminderCount,
      };
    }

    // Load required items
    let classRecord: any = null;
    try {
      classRecord = await this.content.getClassBySlug(request.classSlug);
    } catch {
      // Ignore
    }
    const required = this.parseEquipmentNeeded(classRecord?.equipmentNeeded) ?? [];

    // Load current checkouts
    let checkedOut: CheckoutItem[] = [];
    try {
      checkedOut = await this.inventoryClient.getCheckouts(instructor.inventoryUserId);
    } catch {
      // Ignore
    }

    const stillNeeded = this.computeStillNeeded(required, checkedOut);

    return {
      status: assignment.equipmentStatus,
      required,
      checked_out: checkedOut,
      still_needed: stillNeeded,
      last_checked_at: assignment.equipmentCheckedAt,
      reminder_count: assignment.equipmentReminderCount,
    };
  }
}
