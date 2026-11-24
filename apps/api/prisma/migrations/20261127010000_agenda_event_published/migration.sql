-- AlterTable
ALTER TABLE "agenda_event" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false;

-- PublishExistingEvents
UPDATE "agenda_event" SET "published" = true;
