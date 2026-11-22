-- AlterTable
ALTER TABLE "refresh_token" ADD COLUMN     "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "user_agent" VARCHAR(255);

