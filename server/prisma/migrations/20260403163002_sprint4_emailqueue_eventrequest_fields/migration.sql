/*
  Warnings:

  - A unique constraint covering the columns `[registrationToken]` on the table `EventRequest` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "EventRequest" ADD COLUMN     "assignedInstructorId" INTEGER,
ADD COLUMN     "confirmedDate" TIMESTAMP(3),
ADD COLUMN     "eventCapacity" INTEGER,
ADD COLUMN     "eventType" TEXT NOT NULL DEFAULT 'private',
ADD COLUMN     "googleCalendarEventId" TEXT,
ADD COLUMN     "meetupEventId" TEXT,
ADD COLUMN     "meetupEventUrl" TEXT,
ADD COLUMN     "meetupRsvpCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "minHeadcount" INTEGER,
ADD COLUMN     "proposedDates" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "registrationToken" TEXT,
ADD COLUMN     "votingDeadline" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InstructorAssignment" ADD COLUMN     "timeoutAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "attendeeName" TEXT NOT NULL,
    "attendeeEmail" TEXT NOT NULL,
    "numberOfKids" INTEGER NOT NULL,
    "availableDates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'interested',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailQueue" (
    "id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "textBody" TEXT NOT NULL,
    "htmlBody" TEXT,
    "replyTo" TEXT,
    "attachments" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Registration_requestId_attendeeEmail_key" ON "Registration"("requestId", "attendeeEmail");

-- CreateIndex
CREATE INDEX "EmailQueue_status_nextRetryAt_idx" ON "EmailQueue"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventRequest_registrationToken_key" ON "EventRequest"("registrationToken");

-- AddForeignKey
ALTER TABLE "EventRequest" ADD CONSTRAINT "EventRequest_assignedInstructorId_fkey" FOREIGN KEY ("assignedInstructorId") REFERENCES "InstructorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EventRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
