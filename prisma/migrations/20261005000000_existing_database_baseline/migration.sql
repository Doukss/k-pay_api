-- Initial database layout predates Prisma Migrate. Existing installations mark this migration applied;
-- fresh installations use it to create the three original core tables before agency feature migrations.

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "agency_name" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'agency',
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "property" TEXT NOT NULL,
    "rent_val" NUMERIC(14,0) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "delay_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenants_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "tenants_agency_id_idx" ON "tenants"("agency_id");

CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "locataire" TEXT NOT NULL,
    "montant" NUMERIC(14,0) NOT NULL,
    "moyen_paiement" TEXT NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" TEXT NOT NULL DEFAULT 'reussi',
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "payments_agency_date_idx" ON "payments"("agency_id", "date" DESC);
