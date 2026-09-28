import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  client: ReturnType<typeof postgres> | undefined;
  database: Database | undefined;
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

function usesNeonHttp(url: string) {
  try {
    return new URL(url).hostname.endsWith("neon.tech");
  } catch {
    return false;
  }
}

export function getDatabase() {
  if (!globalForDb.database) {
    const url = getDatabaseUrl();
    if (usesNeonHttp(url)) {
      globalForDb.database = drizzleNeon(
        neon(url, { fetchOptions: { cache: "no-store" } }),
        { schema },
      ) as unknown as Database;
    } else {
      const client = postgres(url, { prepare: false, max: 10 });
      globalForDb.client = client;
      globalForDb.database = drizzlePostgres(client, { schema });
    }
  }

  return globalForDb.database;
}

export async function closeDatabase() {
  const client = globalForDb.client;
  globalForDb.client = undefined;
  globalForDb.database = undefined;
  if (client) await client.end({ timeout: 5 });
}
