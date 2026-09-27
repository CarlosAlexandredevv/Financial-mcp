import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  client: ReturnType<typeof postgres> | undefined;
  database: ReturnType<typeof drizzle<typeof schema>> | undefined;
};

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL não está definida. Copie .env.example para .env.local e ajuste a conexão.",
    );
  }

  return databaseUrl;
}

function getClient() {
  if (!globalForDb.client) {
    globalForDb.client = postgres(getDatabaseUrl(), {
      prepare: false,
      max: 10,
    });
  }

  return globalForDb.client;
}

export function getDatabase() {
  if (!globalForDb.database) {
    globalForDb.database = drizzle(getClient(), { schema });
  }

  return globalForDb.database;
}

export async function closeDatabase() {
  const client = globalForDb.client;
  globalForDb.client = undefined;
  globalForDb.database = undefined;
  if (client) await client.end({ timeout: 5 });
}
