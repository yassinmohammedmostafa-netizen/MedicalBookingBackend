
import "dotenv/config";
import { db, usersTable } from "@workspace/db";
import { hashPassword } from "../src/lib/auth";

async function createAdmin() {
  const email = "y25mmk@gmail.com";
  const password = "Yoyo##2020";
  const passwordHash = await hashPassword(password);

  try {
    await db.insert(usersTable).values({
      email,
      passwordHash,
      role: "admin",
      firstName: "Yassin",
      lastName: "Admin",
      isEmailVerified: true
    });
    console.log("Admin account created successfully!");
  } catch (err) {
    console.error("Failed to create admin account (it might already exist):", err);
  }
}

createAdmin().then(() => process.exit(0));
