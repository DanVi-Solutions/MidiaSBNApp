-- Permite múltiplos responsáveis por demanda e adiciona índice para limpeza automática de demandas finalizadas

CREATE TABLE "demand_assignee" (
    "demand_id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,

    CONSTRAINT "demand_assignee_pkey" PRIMARY KEY ("demand_id","credential_id")
);

CREATE INDEX "demand_assignee_credential_id_idx" ON "demand_assignee"("credential_id");

ALTER TABLE "demand_assignee"
  ADD CONSTRAINT "demand_assignee_demand_id_fkey"
  FOREIGN KEY ("demand_id") REFERENCES "demand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "demand_assignee"
  ADD CONSTRAINT "demand_assignee_credential_id_fkey"
  FOREIGN KEY ("credential_id") REFERENCES "credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "demand_assignee" ("demand_id", "credential_id")
SELECT "id", "assignee_id"
FROM "demand"
WHERE "assignee_id" IS NOT NULL;

ALTER TABLE "demand" DROP CONSTRAINT "demand_assignee_id_fkey";
DROP INDEX "demand_assignee_id_idx";
ALTER TABLE "demand" DROP COLUMN "assignee_id";

CREATE INDEX "demand_status_completed_at_idx" ON "demand"("status", "completed_at");
