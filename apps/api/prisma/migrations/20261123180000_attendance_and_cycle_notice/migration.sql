-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SCHEDULE_CYCLE_OPENED';

-- AlterTable
ALTER TABLE "credential_schedule" ADD COLUMN     "checked_in_at" TIMESTAMPTZ(6),
ADD COLUMN     "confirmed_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "job_marker" (
    "key" VARCHAR(60) NOT NULL,
    "value" VARCHAR(60) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_marker_pkey" PRIMARY KEY ("key")
);


-- Manual: CHECK e RLS não são gerados a partir do schema.prisma

ALTER TABLE "credential_schedule"
  ADD CONSTRAINT "credential_schedule_check_in_requires_confirmation"
  CHECK ("checked_in_at" IS NULL OR "confirmed_at" IS NOT NULL);

ALTER TABLE "job_marker" ENABLE ROW LEVEL SECURITY;
