-- AlterTable
ALTER TABLE "recurring_event" ADD COLUMN     "created_by_id" UUID,
ADD COLUMN     "is_global" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "recurring_event_department" (
    "recurring_event_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,

    CONSTRAINT "recurring_event_department_pkey" PRIMARY KEY ("recurring_event_id","department_id")
);

-- CreateIndex
CREATE INDEX "recurring_event_department_department_id_idx" ON "recurring_event_department"("department_id");

-- CreateIndex
CREATE INDEX "recurring_event_is_global_idx" ON "recurring_event"("is_global");

-- CreateIndex
CREATE INDEX "recurring_event_created_by_id_idx" ON "recurring_event"("created_by_id");

-- AddForeignKey
ALTER TABLE "recurring_event" ADD CONSTRAINT "recurring_event_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "credential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_event_department" ADD CONSTRAINT "recurring_event_department_recurring_event_id_fkey" FOREIGN KEY ("recurring_event_id") REFERENCES "recurring_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_event_department" ADD CONSTRAINT "recurring_event_department_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Manual: migração de dados do escopo legado e remoção da coluna department_id
UPDATE "recurring_event" SET "is_global" = true WHERE "department_id" IS NULL;

INSERT INTO "recurring_event_department" ("recurring_event_id", "department_id")
SELECT "id", "department_id"
FROM "recurring_event"
WHERE "department_id" IS NOT NULL
ON CONFLICT DO NOTHING;

-- DropForeignKey
ALTER TABLE "recurring_event" DROP CONSTRAINT "recurring_event_department_id_fkey";

-- DropIndex
DROP INDEX "recurring_event_department_id_idx";

-- AlterTable
ALTER TABLE "recurring_event" DROP COLUMN "department_id";

-- RLS consistency
ALTER TABLE "recurring_event_department" ENABLE ROW LEVEL SECURITY;
