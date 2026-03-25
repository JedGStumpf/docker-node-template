-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('unverified', 'new', 'discussing', 'dates_proposed', 'confirmed', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('pending', 'accepted', 'declined', 'timed_out');

-- CreateTable
CREATE TABLE "InstructorProfile" (
    "id" SERIAL NOT NULL,
    "pike13UserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "homeZip" TEXT NOT NULL,
    "maxTravelMinutes" INTEGER NOT NULL DEFAULT 60,
    "serviceZips" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstructorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRequest" (
    "id" TEXT NOT NULL,
    "classSlug" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "groupType" TEXT NOT NULL,
    "expectedHeadcount" INTEGER NOT NULL,
    "zipCode" TEXT NOT NULL,
    "locationFreeText" TEXT,
    "preferredDates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "externalRegistrationUrl" TEXT,
    "siteControl" TEXT,
    "siteReadiness" TEXT,
    "marketingCapability" TEXT,
    "verificationToken" TEXT NOT NULL,
    "verificationExpiresAt" TIMESTAMP(3) NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'unverified',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstructorAssignment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "instructorId" INTEGER NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'pending',
    "notificationToken" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstructorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstructorProfile_pike13UserId_key" ON "InstructorProfile"("pike13UserId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRequest_verificationToken_key" ON "EventRequest"("verificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "InstructorAssignment_notificationToken_key" ON "InstructorAssignment"("notificationToken");

-- AddForeignKey
ALTER TABLE "InstructorAssignment" ADD CONSTRAINT "InstructorAssignment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EventRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorAssignment" ADD CONSTRAINT "InstructorAssignment_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "InstructorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
