-- AlterTable
ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "available" BOOLEAN NOT NULL DEFAULT true;
