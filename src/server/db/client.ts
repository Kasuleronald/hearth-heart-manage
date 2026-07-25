import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — see .env.example");
}

// The app must connect as the `app_user` Postgres role (see scripts/db-setup.sql),
// not the migration-owner role, or the RLS policies in schema.ts would be
// silently bypassed — RLS never applies to a table's owner.
const queryClient = postgres(connectionString);
export const db = drizzle(queryClient, { schema });

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Every server function touching a tenant-scoped table must go through this.
// It opens a transaction and sets the Postgres session variable the RLS
// policies in schema.ts key off, via set_config's session-local flag — the
// transaction-scoped equivalent of `SET LOCAL`, safe with a pooled
// connection since it's cleared automatically when the transaction ends.
// This is the one chokepoint every tenant query in the app routes through.
export async function withTenant<T>(
  organizationId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_org_id', ${organizationId}, true)`);
    return fn(tx);
  });
}
