-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SCHEDULE_ASSIGNED', 'SCHEDULE_UNASSIGNED', 'SCHEDULE_CHANGED', 'SCHEDULE_CANCELLED', 'SCHEDULE_REMINDER', 'SELF_SIGNUP_OPENED', 'CHANGE_REQUEST_RECEIVED', 'CHANGE_REQUEST_ACCEPTED', 'CHANGE_REQUEST_REJECTED', 'CHANGE_REQUEST_CANCELLED', 'TRANSFER_REQUESTED', 'TRANSFER_REJECTED', 'DEPARTMENT_CHANGED', 'ROLE_CHANGED', 'UNAVAILABILITY_CONFLICT');

-- AlterTable
ALTER TABLE "credential_schedule" ADD COLUMN     "reminder_sent_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(255) NOT NULL,
    "link" VARCHAR(255),
    "schedule_id" UUID,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscription" (
    "id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "endpoint" VARCHAR(1024) NOT NULL,
    "p256dh" VARCHAR(255) NOT NULL,
    "auth" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_credential_id_created_at_idx" ON "notification"("credential_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notification_schedule_id_idx" ON "notification"("schedule_id");

-- CreateIndex
CREATE INDEX "notification_created_at_idx" ON "notification"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscription_endpoint_key" ON "push_subscription"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscription_credential_id_idx" ON "push_subscription"("credential_id");

-- CreateIndex
CREATE INDEX "push_subscription_session_id_idx" ON "push_subscription"("session_id");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "refresh_token"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Manual: CHECK e RLS não são gerados a partir do schema.prisma

ALTER TABLE "notification"
  ADD CONSTRAINT "notification_title_not_blank" CHECK (length(btrim("title")) > 0),
  ADD CONSTRAINT "notification_body_not_blank" CHECK (length(btrim("body")) > 0),
  ADD CONSTRAINT "notification_link_is_app_path" CHECK ("link" IS NULL OR "link" LIKE '/%');

ALTER TABLE "push_subscription"
  ADD CONSTRAINT "push_subscription_endpoint_https" CHECK ("endpoint" LIKE 'https://%');

ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_subscription" ENABLE ROW LEVEL SECURITY;
