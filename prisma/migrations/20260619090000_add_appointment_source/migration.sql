-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('MANUAL', 'APPLE_CALENDAR', 'DOCTENA');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "source" "AppointmentSource" NOT NULL DEFAULT 'MANUAL';

-- CreateIndex
CREATE INDEX "Appointment_entityId_source_idx" ON "Appointment"("entityId", "source");
