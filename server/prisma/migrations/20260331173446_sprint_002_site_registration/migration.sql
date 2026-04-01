-- AlterTable
ALTER TABLE "EventRequest" ADD COLUMN     "asanaTaskId" TEXT,
ADD COLUMN     "emailThreadAddress" TEXT,
ADD COLUMN     "registeredSiteId" INTEGER,
ALTER COLUMN "preferredDates" DROP DEFAULT;

-- AlterTable
ALTER TABLE "InstructorProfile" ALTER COLUMN "topics" DROP DEFAULT;

-- CreateTable
CREATE TABLE "RegisteredSite" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "capacity" INTEGER,
    "roomNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegisteredSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteInvitation" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "registeredSiteId" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteRep" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "registeredSiteId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteRep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteRepSession" (
    "id" SERIAL NOT NULL,
    "siteRepId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteRepSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SiteInvitation_token_key" ON "SiteInvitation"("token");

-- CreateIndex
CREATE UNIQUE INDEX "SiteRep_email_key" ON "SiteRep"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SiteRepSession_tokenHash_key" ON "SiteRepSession"("tokenHash");

-- AddForeignKey
ALTER TABLE "EventRequest" ADD CONSTRAINT "EventRequest_registeredSiteId_fkey" FOREIGN KEY ("registeredSiteId") REFERENCES "RegisteredSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInvitation" ADD CONSTRAINT "SiteInvitation_registeredSiteId_fkey" FOREIGN KEY ("registeredSiteId") REFERENCES "RegisteredSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteRep" ADD CONSTRAINT "SiteRep_registeredSiteId_fkey" FOREIGN KEY ("registeredSiteId") REFERENCES "RegisteredSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteRepSession" ADD CONSTRAINT "SiteRepSession_siteRepId_fkey" FOREIGN KEY ("siteRepId") REFERENCES "SiteRep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
