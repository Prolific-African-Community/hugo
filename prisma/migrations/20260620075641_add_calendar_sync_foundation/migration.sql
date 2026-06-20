-- CreateEnum
CREATE TYPE "CalendarEventSyncStatus" AS ENUM ('SYNCED', 'LOCAL_PENDING', 'REMOTE_PENDING', 'CONFLICT', 'ERROR');

-- CreateEnum
CREATE TYPE "CalendarSyncActionType" AS ENUM ('CREATE_EVENT', 'UPDATE_EVENT', 'DELETE_EVENT');

-- CreateEnum
CREATE TYPE "CalendarSyncActionStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CalendarEventMapping" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "calendarConnectionId" TEXT NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "externalCalendarId" TEXT,
    "externalEtag" TEXT,
    "externalLastModified" TIMESTAMP(3),
    "lastPulledAt" TIMESTAMP(3),
    "lastPushedAt" TIMESTAMP(3),
    "syncStatus" "CalendarEventSyncStatus" NOT NULL DEFAULT 'SYNCED',
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEventMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSyncAction" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "calendarConnectionId" TEXT,
    "mappingId" TEXT,
    "provider" "CalendarProvider" NOT NULL,
    "actionType" "CalendarSyncActionType" NOT NULL,
    "status" "CalendarSyncActionStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "CalendarSyncAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventMapping_appointmentId_key" ON "CalendarEventMapping"("appointmentId");

-- CreateIndex
CREATE INDEX "CalendarEventMapping_entityId_idx" ON "CalendarEventMapping"("entityId");

-- CreateIndex
CREATE INDEX "CalendarEventMapping_entityId_syncStatus_idx" ON "CalendarEventMapping"("entityId", "syncStatus");

-- CreateIndex
CREATE INDEX "CalendarEventMapping_calendarConnectionId_idx" ON "CalendarEventMapping"("calendarConnectionId");

-- CreateIndex
CREATE INDEX "CalendarEventMapping_externalEventId_idx" ON "CalendarEventMapping"("externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventMapping_calendarConnectionId_externalEventId_key" ON "CalendarEventMapping"("calendarConnectionId", "externalEventId");

-- CreateIndex
CREATE INDEX "CalendarSyncAction_entityId_idx" ON "CalendarSyncAction"("entityId");

-- CreateIndex
CREATE INDEX "CalendarSyncAction_entityId_status_idx" ON "CalendarSyncAction"("entityId", "status");

-- CreateIndex
CREATE INDEX "CalendarSyncAction_appointmentId_idx" ON "CalendarSyncAction"("appointmentId");

-- CreateIndex
CREATE INDEX "CalendarSyncAction_calendarConnectionId_idx" ON "CalendarSyncAction"("calendarConnectionId");

-- CreateIndex
CREATE INDEX "CalendarSyncAction_mappingId_idx" ON "CalendarSyncAction"("mappingId");

-- CreateIndex
CREATE INDEX "CalendarSyncAction_provider_status_idx" ON "CalendarSyncAction"("provider", "status");

-- CreateIndex
CREATE INDEX "CalendarSyncAction_createdAt_idx" ON "CalendarSyncAction"("createdAt");

-- AddForeignKey
ALTER TABLE "CalendarEventMapping" ADD CONSTRAINT "CalendarEventMapping_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventMapping" ADD CONSTRAINT "CalendarEventMapping_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventMapping" ADD CONSTRAINT "CalendarEventMapping_calendarConnectionId_fkey" FOREIGN KEY ("calendarConnectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncAction" ADD CONSTRAINT "CalendarSyncAction_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncAction" ADD CONSTRAINT "CalendarSyncAction_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncAction" ADD CONSTRAINT "CalendarSyncAction_calendarConnectionId_fkey" FOREIGN KEY ("calendarConnectionId") REFERENCES "CalendarConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncAction" ADD CONSTRAINT "CalendarSyncAction_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "CalendarEventMapping"("id") ON DELETE SET NULL ON UPDATE CASCADE;
