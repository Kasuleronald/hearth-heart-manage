// One-time bootstrap: creates the first SuperAdmin (platform admin) account.
// There's no self-signup for this role — anyone hitting the login page
// shouldn't be able to provision themselves platform-wide access — so this
// has to be run directly against the database once, after migrations.
//
// Usage:
//   PLATFORM_ADMIN_EMAIL=you@example.com PLATFORM_ADMIN_PASSWORD=... PLATFORM_ADMIN_NAME="Your Name" \
//     npm run db:seed-admin
// (npm run db:seed-admin loads .env via Node's --env-file flag — no extra
// dependency needed; requires Node 20.6+.)
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { db } from "../src/server/db/client";
import { platformAdmins } from "../src/server/db/schema";

async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  const fullName = process.env.PLATFORM_ADMIN_NAME?.trim();

  if (!email || !password || !fullName) {
    console.error(
      "Set PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD, and PLATFORM_ADMIN_NAME, then re-run.",
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const existing = await db.query.platformAdmins.findFirst({
    where: eq(platformAdmins.email, email),
  });
  if (existing) {
    console.error(`A platform admin with email ${email} already exists.`);
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await db.insert(platformAdmins).values({ email, passwordHash, fullName });
  console.log(`Platform admin created: ${email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
