-- AlterEnum
ALTER TYPE "ChangeStatus" ADD VALUE 'DECLINED';


-- Manual: a pessoa que avisa que não vai (DECLINED) continua na escala sem substituto indicado

ALTER TABLE "credential_schedule" DROP CONSTRAINT "credential_schedule_change_consistency";

ALTER TABLE "credential_schedule"
  ADD CONSTRAINT "credential_schedule_change_consistency"
  CHECK (("change_status" IN ('REQUESTED', 'REJECTED')) = ("credential_change_id" IS NOT NULL));
