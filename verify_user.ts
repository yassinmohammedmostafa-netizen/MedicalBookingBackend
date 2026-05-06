import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function check() {
  const users = await db.select().from(usersTable);
  console.log("Total users:", users.length);
  const found = users.find(u => u.email === "y25mmk@gmail.com");
  console.log("User y25mmk@gmail.com exists:", !!found);
  console.log("Existing emails:", users.map(u => u.email));
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
