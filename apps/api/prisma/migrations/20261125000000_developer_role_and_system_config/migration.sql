-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'DEVELOPER';

-- CreateTable
CREATE TABLE "system_config" (
    "id" VARCHAR(32) NOT NULL DEFAULT 'default',
    "maintenance_mode" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);
