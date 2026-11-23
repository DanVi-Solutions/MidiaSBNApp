-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT_DECLINED';
ALTER TYPE "NotificationType" ADD VALUE 'PRESENCE_NOT_CONFIRMED';

-- DropIndex
DROP INDEX "schedule_department_id_schedule_at_key";

-- AlterTable
ALTER TABLE "schedule" ADD COLUMN     "attendance_notice_sent_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "schedule_department_id_schedule_at_idx" ON "schedule"("department_id", "schedule_at");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_recurring_event_id_department_id_schedule_at_key" ON "schedule"("recurring_event_id", "department_id", "schedule_at");

