import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";
import "dotenv/config";

const getConnectionString = () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not defined in environment variables!");
  }
  return url;
};

// We use a lazy client that only connects when needed
let client: any;
let dbInstance: any;

export const getDb = () => {
  if (!dbInstance) {
    client = postgres(getConnectionString());
    dbInstance = drizzle(client, { schema });
  }
  return dbInstance;
};

// Maintain compatibility with existing code by exporting a proxy or the instance
export const db = new Proxy({} as any, {
  get: (target, prop) => {
    return getDb()[prop];
  }
});

export * from "./schema/index.js";
