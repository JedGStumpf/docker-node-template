-- Sprint 5: Add EmailExtraction model and equipment readiness fields

-- Add EmailExtraction model
CREATE TABLE "EmailExtraction" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "statusSignal" TEXT,
    "actionItems" TEXT[],
    "hostRegistrationCount" INTEGER,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailExtraction_pkey" PRIMARY KEY ("id")
);

-- Add index on requestId
CREATE INDEX "EmailExtraction_requestId_idx" ON "EmailExtraction"("requestId");

-- Add FK constraint
ALTER TABLE "EmailExtraction" ADD CONSTRAINT "EmailExtraction_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EventRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add equipment readiness fields to InstructorAssignment
ALTER TABLE "InstructorAssignment" ADD COLUMN "equipmentStatus" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "InstructorAssignment" ADD COLUMN "equipmentCheckedAt" TIMESTAMP(3);
ALTER TABLE "InstructorAssignment" ADD COLUMN "equipmentReminderCount" INTEGER NOT NULL DEFAULT 0;

-- Add inventoryUserId to InstructorProfile
ALTER TABLE "InstructorProfile" ADD COLUMN "inventoryUserId" TEXT;
