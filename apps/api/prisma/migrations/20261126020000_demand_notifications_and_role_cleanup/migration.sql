-- Remove papéis específicos de demandas e adiciona notificações para interações em demandas

UPDATE "credential" SET "role" = 'VOLUNTEER' WHERE "role" = 'DEMAND_MANAGER';
UPDATE "credential" SET "role" = 'SCHEDULER_MANAGER' WHERE "role" = 'SCHEDULER_DEMAND_MANAGER';

ALTER TABLE "credential" DROP CONSTRAINT IF EXISTS "credential_number_format";

CREATE TYPE "Role_new" AS ENUM (
  'DEVELOPER',
  'ADMINISTRATOR',
  'GENERAL_MANAGER',
  'DEPARTMENT_MANAGER',
  'SCHEDULER_MANAGER',
  'VOLUNTEER'
);

ALTER TABLE "credential" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "credential" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "credential" ALTER COLUMN "role" SET DEFAULT 'VOLUNTEER';

ALTER TABLE "credential"
  ADD CONSTRAINT "credential_number_format"
  CHECK (
    "credential_number" IS NULL
    OR ("role" = 'DEVELOPER' AND "credential_number" ~ '^DEV-[A-HJKMNP-Z2-9]{10}$')
    OR ("role" <> 'DEVELOPER' AND "credential_number" ~ '^SBN-[A-HJKMNP-Z2-9]{10}$')
  );

ALTER TYPE "NotificationType" ADD VALUE 'DEMAND_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'DEMAND_UNASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'DEMAND_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE 'DEMAND_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'DEMAND_REOPENED';
ALTER TYPE "NotificationType" ADD VALUE 'DEMAND_DELETED';
