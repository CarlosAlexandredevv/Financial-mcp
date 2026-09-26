import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  client: ReturnType<typeof postgres> | undefined;
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

export const db = drizzle(getClient(), { schema });
export type Database = typeof db;
