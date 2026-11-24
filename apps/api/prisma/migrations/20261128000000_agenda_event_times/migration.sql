-- AlterTable
ALTER TABLE "agenda_event" ADD COLUMN "times" VARCHAR(5)[];

-- BackfillEventTimes
UPDATE "agenda_event"
SET "times" = ARRAY[to_char("starts_at" AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')]::VARCHAR(5)[];

-- AlterTable
ALTER TABLE "agenda_event_department"
ADD COLUMN "synced_slots" VARCHAR(5)[] DEFAULT ARRAY[]::VARCHAR(5)[];

-- BackfillSyncedSlots
UPDATE "agenda_event_department" AS d
SET "synced_slots" = e."times"
FROM "agenda_event" AS e
WHERE e."id" = d."agenda_event_id" AND d."synced_at" IS NOT NULL;

-- DropIndex
DROP INDEX "agenda_event_department_synced_at_idx";

-- AlterTable
ALTER TABLE "agenda_event_department" DROP COLUMN "synced_at";

-- AlterTable
ALTER TABLE "schedule" ADD COLUMN "agenda_slot" VARCHAR(5);

-- BackfillScheduleSlots
UPDATE "schedule" AS s
SET "agenda_slot" = e."times"[1]
FROM "agenda_event" AS e
WHERE e."id" = s."agenda_event_id";

-- DropIndex
DROP INDEX "schedule_agenda_event_id_department_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "schedule_agenda_event_id_department_id_agenda_slot_key" ON "schedule"("agenda_event_id", "department_id", "agenda_slot");
