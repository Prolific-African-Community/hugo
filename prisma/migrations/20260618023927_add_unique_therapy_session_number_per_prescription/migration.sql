-- CreateIndex
CREATE UNIQUE INDEX "TherapySession_prescriptionId_sessionNumber_key" ON "TherapySession"("prescriptionId", "sessionNumber");
