-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('NONE', 'REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMINISTRATOR', 'GENERAL_MANAGER', 'DEPARTMENT_MANAGER', 'SCHEDULER_MANAGER', 'VOLUNTEER');

-- CreateTable
CREATE TABLE "credential" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "username" VARCHAR(15),
    "status" "CredentialStatus" NOT NULL DEFAULT 'PENDING',
    "role" "Role" NOT NULL DEFAULT 'VOLUNTEER',
    "credential_number" VARCHAR(30) NOT NULL,

    CONSTRAINT "credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_code" (
    "id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,

    CONSTRAINT "recovery_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(255),

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_department" (
    "id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "transfer_from_department_id" UUID,
    "transfer_requested_by_id" UUID,

    CONSTRAINT "credential_department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "schedule_at" TIMESTAMPTZ(6) NOT NULL,
    "department_id" UUID NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "description" VARCHAR(255),
    "recurring_event_id" UUID,

    CONSTRAINT "schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_event" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(255),
    "weekday" "Weekday" NOT NULL,
    "department_id" UUID,
    "times" VARCHAR(5)[],

    CONSTRAINT "recurring_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_schedule" (
    "id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "change_status" "ChangeStatus" NOT NULL DEFAULT 'NONE',
    "credential_change_id" UUID,

    CONSTRAINT "credential_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability" (
    "id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "morning" BOOLEAN NOT NULL DEFAULT false,
    "afternoon" BOOLEAN NOT NULL DEFAULT false,
    "night" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unavailability" (
    "id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" VARCHAR(255),

    CONSTRAINT "unavailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credential_username_key" ON "credential"("username");

-- CreateIndex
CREATE UNIQUE INDEX "credential_credential_number_key" ON "credential"("credential_number");

-- CreateIndex
CREATE INDEX "recovery_code_credential_id_idx" ON "recovery_code"("credential_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_token_credential_id_idx" ON "refresh_token"("credential_id");

-- CreateIndex
CREATE UNIQUE INDEX "department_name_key" ON "department"("name");

-- CreateIndex
CREATE INDEX "credential_department_department_id_pending_idx" ON "credential_department"("department_id", "pending");

-- CreateIndex
CREATE UNIQUE INDEX "credential_department_credential_id_department_id_key" ON "credential_department"("credential_id", "department_id");

-- CreateIndex
CREATE INDEX "schedule_recurring_event_id_idx" ON "schedule"("recurring_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_department_id_schedule_at_key" ON "schedule"("department_id", "schedule_at");

-- CreateIndex
CREATE INDEX "recurring_event_department_id_idx" ON "recurring_event"("department_id");

-- CreateIndex
CREATE INDEX "credential_schedule_schedule_id_idx" ON "credential_schedule"("schedule_id");

-- CreateIndex
CREATE INDEX "credential_schedule_credential_change_id_idx" ON "credential_schedule"("credential_change_id");

-- CreateIndex
CREATE UNIQUE INDEX "credential_schedule_credential_id_schedule_id_key" ON "credential_schedule"("credential_id", "schedule_id");

-- CreateIndex
CREATE INDEX "availability_weekday_idx" ON "availability"("weekday");

-- CreateIndex
CREATE UNIQUE INDEX "availability_credential_id_weekday_key" ON "availability"("credential_id", "weekday");

-- CreateIndex
CREATE INDEX "unavailability_credential_id_start_at_idx" ON "unavailability"("credential_id", "start_at");

-- AddForeignKey
ALTER TABLE "recovery_code" ADD CONSTRAINT "recovery_code_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_department" ADD CONSTRAINT "credential_department_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_department" ADD CONSTRAINT "credential_department_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_department" ADD CONSTRAINT "credential_department_transfer_from_department_id_fkey" FOREIGN KEY ("transfer_from_department_id") REFERENCES "department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_department" ADD CONSTRAINT "credential_department_transfer_requested_by_id_fkey" FOREIGN KEY ("transfer_requested_by_id") REFERENCES "credential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_recurring_event_id_fkey" FOREIGN KEY ("recurring_event_id") REFERENCES "recurring_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_event" ADD CONSTRAINT "recurring_event_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_schedule" ADD CONSTRAINT "credential_schedule_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_schedule" ADD CONSTRAINT "credential_schedule_credential_change_id_fkey" FOREIGN KEY ("credential_change_id") REFERENCES "credential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_schedule" ADD CONSTRAINT "credential_schedule_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability" ADD CONSTRAINT "availability_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unavailability" ADD CONSTRAINT "unavailability_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Manual: CHECK e RLS não são gerados a partir do schema.prisma

ALTER TABLE "credential"
  ADD CONSTRAINT "credential_username_format"
  CHECK ("username" ~ '^[a-z0-9_.]{3,15}$');

ALTER TABLE "credential"
  ADD CONSTRAINT "credential_number_format"
  CHECK ("credential_number" ~ '^SBN-[A-HJKMNP-Z2-9]{10}$');

ALTER TABLE "credential_department"
  ADD CONSTRAINT "credential_department_transfer_consistency"
  CHECK (
    ("pending" = false AND "transfer_from_department_id" IS NULL AND "transfer_requested_by_id" IS NULL)
    OR ("pending" = true AND "transfer_from_department_id" IS NOT NULL)
  );

ALTER TABLE "credential_schedule"
  ADD CONSTRAINT "credential_schedule_change_consistency"
  CHECK (("change_status" = 'NONE') = ("credential_change_id" IS NULL));

ALTER TABLE "unavailability"
  ADD CONSTRAINT "unavailability_range"
  CHECK ("end_at" > "start_at");

ALTER TABLE "recurring_event"
  ADD CONSTRAINT "recurring_event_times_format"
  CHECK (
    cardinality("times") > 0
    AND array_to_string("times", ',') ~ '^([01][0-9]|2[0-3]):[0-5][0-9](,([01][0-9]|2[0-3]):[0-5][0-9])*$'
  );

ALTER TABLE "credential"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recovery_code"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_token"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "department"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credential_department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schedule"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recurring_event"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credential_schedule"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "availability"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "unavailability"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations"    ENABLE ROW LEVEL SECURITY;
