-- Atualiza o padrão de credential_number para que a conta DEVELOPER utilize o prefixo DEV-

ALTER TABLE "credential"
  DROP CONSTRAINT "credential_number_format";

UPDATE "credential"
SET "credential_number" = 'DEV-' || substring("credential_number" from 5)
WHERE "role" = 'DEVELOPER' AND "credential_number" LIKE 'SBN-%';

ALTER TABLE "credential"
  ADD CONSTRAINT "credential_number_format"
  CHECK (
    "credential_number" IS NULL
    OR ("role" = 'DEVELOPER' AND "credential_number" ~ '^DEV-[A-HJKMNP-Z2-9]{10}$')
    OR ("role" <> 'DEVELOPER' AND "credential_number" ~ '^SBN-[A-HJKMNP-Z2-9]{10}$')
  );
