/*
  Warnings:

  - Added the required column `entityId` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entityId` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entityId` to the `Patient` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entityId` to the `PatientDocument` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entityId` to the `Prescription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entityId` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entityId` to the `TherapySession` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "entityId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "entityId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "entityId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PatientDocument" ADD COLUMN     "entityId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "entityId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "entityId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TherapySession" ADD COLUMN     "entityId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Appointment_entityId_idx" ON "Appointment"("entityId");

-- CreateIndex
CREATE INDEX "Appointment_entityId_startsAt_idx" ON "Appointment"("entityId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_entityId_status_idx" ON "Appointment"("entityId", "status");

-- CreateIndex
CREATE INDEX "Invoice_entityId_idx" ON "Invoice"("entityId");

-- CreateIndex
CREATE INDEX "Invoice_entityId_status_idx" ON "Invoice"("entityId", "status");

-- CreateIndex
CREATE INDEX "Invoice_entityId_dueAt_idx" ON "Invoice"("entityId", "dueAt");

-- CreateIndex
CREATE INDEX "Patient_entityId_idx" ON "Patient"("entityId");

-- CreateIndex
CREATE INDEX "Patient_entityId_status_idx" ON "Patient"("entityId", "status");

-- CreateIndex
CREATE INDEX "Patient_entityId_lastName_firstName_idx" ON "Patient"("entityId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "PatientDocument_entityId_idx" ON "PatientDocument"("entityId");

-- CreateIndex
CREATE INDEX "PatientDocument_entityId_createdAt_idx" ON "PatientDocument"("entityId", "createdAt");

-- CreateIndex
CREATE INDEX "Prescription_entityId_idx" ON "Prescription"("entityId");

-- CreateIndex
CREATE INDEX "Prescription_entityId_status_idx" ON "Prescription"("entityId", "status");

-- CreateIndex
CREATE INDEX "Task_entityId_idx" ON "Task"("entityId");

-- CreateIndex
CREATE INDEX "Task_entityId_status_idx" ON "Task"("entityId", "status");

-- CreateIndex
CREATE INDEX "Task_entityId_dueAt_idx" ON "Task"("entityId", "dueAt");

-- CreateIndex
CREATE INDEX "TherapySession_entityId_idx" ON "TherapySession"("entityId");

-- CreateIndex
CREATE INDEX "TherapySession_entityId_status_idx" ON "TherapySession"("entityId", "status");

-- CreateIndex
CREATE INDEX "TherapySession_entityId_scheduledAt_idx" ON "TherapySession"("entityId", "scheduledAt");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapySession" ADD CONSTRAINT "TherapySession_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
