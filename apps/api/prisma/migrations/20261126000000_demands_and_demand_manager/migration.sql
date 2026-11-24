-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'DEMAND_MANAGER';
ALTER TYPE "Role" ADD VALUE 'SCHEDULER_DEMAND_MANAGER';

-- CreateEnum
CREATE TYPE "DemandStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "department" ADD COLUMN "has_demands" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "demand" (
    "id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "status" "DemandStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "department_id" UUID NOT NULL,
    "assignee_id" UUID,
    "created_by_id" UUID,
    "due_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "demand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demand_department_id_status_idx" ON "demand"("department_id", "status");

-- CreateIndex
CREATE INDEX "demand_assignee_id_idx" ON "demand"("assignee_id");

-- AddForeignKey
ALTER TABLE "demand" ADD CONSTRAINT "demand_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand" ADD CONSTRAINT "demand_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "credential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand" ADD CONSTRAINT "demand_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "credential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
