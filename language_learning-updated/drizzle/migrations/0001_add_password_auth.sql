-- Migration: 0001_add_password_auth
-- Adds username and passwordHash to the users table for email/password login.
-- Existing rows keep NULL for both columns (they were created via OAuth).

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "username"     varchar(64)  UNIQUE,
  ADD COLUMN IF NOT EXISTS "passwordHash" varchar(256),
  ADD COLUMN IF NOT EXISTS "email_unique_constraint" text; -- placeholder

-- Drop placeholder column (used only to make the migration idempotent)
ALTER TABLE "users"
  DROP COLUMN IF EXISTS "email_unique_constraint";

-- Make email unique if it isn't already
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_email_unique' AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE ("email");
  END IF;
END $$;

-- Index for fast username lookups on login
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_idx" ON "users" ("username");
