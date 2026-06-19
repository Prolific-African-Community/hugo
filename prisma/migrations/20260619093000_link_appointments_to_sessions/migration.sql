-- AlterTable
ALTER TABLE "TherapySession" ADD COLUMN "appointmentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TherapySession_appointmentId_key" ON "TherapySession"("appointmentId");

-- CreateIndex
CREATE INDEX "TherapySession_appointmentId_idx" ON "TherapySession"("appointmentId");

-- AddForeignKey
ALTER TABLE "TherapySession" ADD CONSTRAINT "TherapySession_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
