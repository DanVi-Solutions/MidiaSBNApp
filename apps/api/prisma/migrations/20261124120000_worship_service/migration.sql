-- CreateEnum
CREATE TYPE "WorshipService" AS ENUM ('SUNDAY_0815', 'SUNDAY_1030', 'SUNDAY_1800');

-- AlterTable
ALTER TABLE "credential" ADD COLUMN     "worship_service" "WorshipService";

