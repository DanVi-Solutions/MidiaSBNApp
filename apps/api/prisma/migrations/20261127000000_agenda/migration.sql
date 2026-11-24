-- AlterTable
ALTER TABLE "schedule" ADD COLUMN     "agenda_event_id" UUID;
-- CreateTable
CREATE TABLE "agenda_event" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(255),
    "location" VARCHAR(120),
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "agenda_event_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "agenda_event_department" (
    "agenda_event_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "synced_at" TIMESTAMPTZ(6),
    CONSTRAINT "agenda_event_department_pkey" PRIMARY KEY ("agenda_event_id","department_id")
);
-- CreateIndex
CREATE INDEX "agenda_event_starts_at_idx" ON "agenda_event"("starts_at");
-- CreateIndex
CREATE INDEX "agenda_event_department_department_id_idx" ON "agenda_event_department"("department_id");
-- CreateIndex
CREATE INDEX "agenda_event_department_synced_at_idx" ON "agenda_event_department"("synced_at");
-- CreateIndex
CREATE UNIQUE INDEX "schedule_agenda_event_id_department_id_key" ON "schedule"("agenda_event_id", "department_id");
-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_agenda_event_id_fkey" FOREIGN KEY ("agenda_event_id") REFERENCES "agenda_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "agenda_event" ADD CONSTRAINT "agenda_event_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "credential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "agenda_event_department" ADD CONSTRAINT "agenda_event_department_agenda_event_id_fkey" FOREIGN KEY ("agenda_event_id") REFERENCES "agenda_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "agenda_event_department" ADD CONSTRAINT "agenda_event_department_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EnableRowLevelSecurity
ALTER TABLE "agenda_event"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agenda_event_department" ENABLE ROW LEVEL SECURITY;
