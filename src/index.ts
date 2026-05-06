import "dotenv/config";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { seedIfEmpty } from "./lib/seed.js";

console.log("[ENV] Checking environment variables...");
console.log(`[ENV] PORT: ${process.env.PORT}`);
console.log(`[ENV] NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`[ENV] DATABASE_URL: ${process.env.DATABASE_URL}`);
console.log(`[ENV] RESEND_API_KEY present: ${!!process.env.RESEND_API_KEY}`);
console.log(`[ENV] SMTP_HOST present: ${!!process.env.SMTP_HOST}`);

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, "0.0.0.0", async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  try {
    await seedIfEmpty();
  } catch (seedErr) {
    logger.error({ err: seedErr }, "Seed failed");
  }
});
