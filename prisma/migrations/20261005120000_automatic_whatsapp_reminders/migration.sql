ALTER TABLE "reminders"
ADD COLUMN "reminder_kind" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN "dedupe_key" TEXT;

CREATE UNIQUE INDEX "reminders_dedupe_key_key" ON "reminders"("dedupe_key");
