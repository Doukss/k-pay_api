-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_agency_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "tenants" DROP CONSTRAINT "tenants_agency_id_fkey";

-- DropIndex
DROP INDEX "tenants_agency_id_idx";

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "billing_period" TEXT,
ADD COLUMN     "property" TEXT,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "subtitle" TEXT,
ALTER COLUMN "tenant_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "phone_normalized" TEXT;
UPDATE "tenants"
SET "phone_normalized" = RIGHT(REGEXP_REPLACE("phone", '[^0-9]', '', 'g'), 9);
ALTER TABLE "tenants" ALTER COLUMN "phone_normalized" SET NOT NULL;

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "plan_id" TEXT NOT NULL DEFAULT 'starter',
    "plan_name" TEXT NOT NULL DEFAULT 'Starter (50 locataires)',
    "price" INTEGER NOT NULL DEFAULT 15000,
    "max_tenants" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'trial',
    "is_trial" BOOLEAN NOT NULL DEFAULT true,
    "trial_started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trial_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "trial_already_used" BOOLEAN NOT NULL DEFAULT false,
    "last_payment_date" TIMESTAMPTZ(6),
    "next_billing_date" TIMESTAMPTZ(6),
    "period_ends_at" TIMESTAMPTZ(6),
    "payment_method" TEXT,
    "transaction_ref" TEXT,
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "monthly_renewal_due" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_invoices" (
    "id" TEXT NOT NULL,
    "subscription_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_method" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'paid',

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_settings" (
    "id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "administrative_email" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "ninea" TEXT NOT NULL DEFAULT '',
    "wave_active" BOOLEAN NOT NULL DEFAULT true,
    "orange_money_active" BOOLEAN NOT NULL DEFAULT true,
    "fee_bearer" TEXT NOT NULL DEFAULT 'agency',
    "remind_j_minus_3" BOOLEAN NOT NULL DEFAULT true,
    "remind_j_day" BOOLEAN NOT NULL DEFAULT true,
    "remind_j_plus_3" BOOLEAN NOT NULL DEFAULT true,
    "remind_language" TEXT NOT NULL DEFAULT 'bilingual',
    "rent_due_day" INTEGER NOT NULL DEFAULT 5,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agency_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "agency_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_activities" (
    "id" TEXT NOT NULL,
    "agency_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "status" TEXT NOT NULL DEFAULT 'prepared',
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payment_url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_agency_id_key" ON "subscriptions"("agency_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_reference_key" ON "subscription_invoices"("reference");

-- CreateIndex
CREATE INDEX "subscription_invoices_subscription_id_date_idx" ON "subscription_invoices"("subscription_id", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "agency_settings_agency_id_key" ON "agency_settings"("agency_id");

-- CreateIndex
CREATE INDEX "notifications_agency_id_created_at_idx" ON "notifications"("agency_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_agency_id_is_read_idx" ON "notifications"("agency_id", "is_read");

-- CreateIndex
CREATE INDEX "agency_activities_agency_id_created_at_idx" ON "agency_activities"("agency_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reminders_agency_id_created_at_idx" ON "reminders"("agency_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_billing_period_key" ON "payments"("tenant_id", "billing_period");

-- CreateIndex
CREATE INDEX "tenants_agency_id_status_idx" ON "tenants"("agency_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_agency_id_email_key" ON "tenants"("agency_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_agency_id_phone_normalized_key" ON "tenants"("agency_id", "phone_normalized");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_settings" ADD CONSTRAINT "agency_settings_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_activities" ADD CONSTRAINT "agency_activities_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "payments_agency_date_idx" RENAME TO "payments_agency_id_date_idx";

