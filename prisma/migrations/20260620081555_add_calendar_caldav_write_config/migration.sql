-- CreateEnum
CREATE TYPE "CalendarWriteStatus" AS ENUM ('NOT_CONFIGURED', 'READY', 'ERROR', 'DISABLED');

-- AlterTable
ALTER TABLE "CalendarConnection" ADD COLUMN     "caldavPasswordEncrypted" TEXT,
ADD COLUMN     "caldavUrl" TEXT,
ADD COLUMN     "caldavUsername" TEXT,
ADD COLUMN     "capabilities" JSONB,
ADD COLUMN     "lastWriteTestAt" TIMESTAMP(3),
ADD COLUMN     "selectedCalendarName" TEXT,
ADD COLUMN     "selectedCalendarUrl" TEXT,
ADD COLUMN     "writeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "writeLastError" TEXT,
ADD COLUMN     "writeStatus" "CalendarWriteStatus" NOT NULL DEFAULT 'NOT_CONFIGURED';

-- CreateIndex
CREATE INDEX "CalendarConnection_entityId_writeStatus_idx" ON "CalendarConnection"("entityId", "writeStatus");
