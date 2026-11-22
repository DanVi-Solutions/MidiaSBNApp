-- AlterEnum
ALTER TYPE "CredentialStatus" ADD VALUE 'RECOVERING';

-- DropForeignKey
ALTER TABLE "recovery_code" DROP CONSTRAINT "recovery_code_credential_id_fkey";

-- AlterTable
ALTER TABLE "credential" ADD COLUMN     "credential_number_hash" CHAR(64),
ALTER COLUMN "credential_number" DROP NOT NULL;

-- DropTable
DROP TABLE "recovery_code";

-- CreateIndex
CREATE UNIQUE INDEX "credential_credential_number_hash_key" ON "credential"("credential_number_hash");

-- Manual: conversão dos dados existentes e CHECK não são gerados a partir do schema.prisma

UPDATE "credential" SET "status" = 'RECOVERING' WHERE "status" = 'ACTIVE';

UPDATE "credential" SET "credential_number" = NULL WHERE "status" = 'INACTIVE';

ALTER TABLE "credential"
  ADD CONSTRAINT "credential_number_hash_format"
  CHECK ("credential_number_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "credential"
  ADD CONSTRAINT "credential_number_storage"
  CHECK (
    ("status" IN ('PENDING', 'RECOVERING') AND "credential_number" IS NOT NULL AND "credential_number_hash" IS NULL)
    OR ("status" = 'ACTIVE' AND "credential_number" IS NULL AND "credential_number_hash" IS NOT NULL)
    OR ("status" = 'INACTIVE' AND "credential_number" IS NULL)
  );
