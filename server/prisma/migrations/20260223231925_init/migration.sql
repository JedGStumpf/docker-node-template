-- CreateTable
CREATE TABLE "Counter" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Counter_name_key" ON "Counter"("name");
