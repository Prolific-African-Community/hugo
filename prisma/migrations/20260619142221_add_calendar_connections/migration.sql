-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('APPLE_CALENDAR');

-- CreateEnum
CREATE TYPE "CalendarConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "provider" "CalendarProvider" NOT NULL DEFAULT 'APPLE_CALENDAR',
    "name" TEXT NOT NULL,
    "calendarUrl" TEXT NOT NULL,
    "status" "CalendarConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarConnection_entityId_idx" ON "CalendarConnection"("entityId");

-- CreateIndex
CREATE INDEX "CalendarConnection_entityId_provider_idx" ON "CalendarConnection"("entityId", "provider");

-- CreateIndex
CREATE INDEX "CalendarConnection_entityId_status_idx" ON "CalendarConnection"("entityId", "status");

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
