-- One-time setup, run once per Postgres instance (local dev and the Oracle
-- VM alike) as the database owner/superuser, e.g.:
--   psql "$DATABASE_URL_MIGRATE" -f scripts/db-setup.sql
--
-- Creates the `app_user` role the running app connects as (see
-- src/server/db/client.ts / DATABASE_URL in .env). This role deliberately
-- does NOT own the tables and has no DDL rights — it only gets DML grants
-- below — so the Row-Level Security tenant-isolation policies defined in
-- src/server/db/schema.ts actually apply to it. RLS never applies to a
-- table's owner, which is exactly why the app must NOT connect as the
-- owner/migration role.
--
-- Run this AFTER `npm run db:migrate` has created the tables, so the GRANT
-- statements below have something to grant against. Re-running is safe.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    -- Change this password, then put the matching value in .env's
    -- DATABASE_URL (postgres://app_user:<password>@...).
    CREATE ROLE app_user WITH LOGIN PASSWORD 'CHANGE_ME' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE CURRENT_DATABASE() TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- So future `npm run db:migrate` runs (which create new tables as the owner
-- role) don't require re-running this grant by hand every time.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
