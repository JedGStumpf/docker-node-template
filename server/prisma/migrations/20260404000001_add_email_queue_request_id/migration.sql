-- AlterTable
ALTER TABLE "EmailQueue" ADD COLUMN     "requestId" TEXT;

-- CreateIndex
CREATE INDEX "EmailQueue_requestId_idx" ON "EmailQueue"("requestId");
