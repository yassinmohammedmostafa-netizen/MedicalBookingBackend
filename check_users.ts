import { db } from "./src/lib/db.ts";
import { usersTable } from "../../lib/db/src/schema/users.ts";
import { eq } from "drizzle-orm";

async function check() {
  const users = await db.select().from(usersTable);
  console.log("Total users:", users.length);
  console.log("Users:", JSON.stringify(users.map(u => ({ id: u.id, email: u.email })), null, 2));
  process.exit(0);
}

check();
