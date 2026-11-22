-- AlterTable
ALTER TABLE "schedule" ADD COLUMN     "self_signup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "volunteers_needed" SMALLINT;


-- Manual: CHECK não é gerado a partir do schema.prisma

ALTER TABLE "schedule"
  ADD CONSTRAINT "schedule_volunteers_needed_positive"
  CHECK ("volunteers_needed" IS NULL OR "volunteers_needed" > 0);

ALTER TABLE "schedule"
  ADD CONSTRAINT "schedule_self_signup_requires_volunteers_needed"
  CHECK (NOT "self_signup" OR "volunteers_needed" IS NOT NULL);
