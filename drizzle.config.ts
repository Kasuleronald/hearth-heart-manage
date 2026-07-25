import { defineConfig } from "drizzle-kit";

// Migrations run as the table-owning role (full DDL rights) — see
// DATABASE_URL_MIGRATE in .env.example. The app itself connects as the
// separate, DML-only `app_user` role (DATABASE_URL, src/server/db/client.ts)
// so the Row-Level Security policies in schema.ts can't be bypassed.
export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL ?? "",
  },
});
