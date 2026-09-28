import "server-only";
import { randomUUID } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { oauthClients, oauthCodes } from "@/db/schema";

export type ConsumedOauthCode = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
};

export async function insertOauthClient(
  redirectUris: string[],
): Promise<{ clientId: string }> {
  const clientId = randomUUID();
  await getDatabase().insert(oauthClients).values({
    clientId,
    redirectUris: JSON.stringify(redirectUris),
  });
  return { clientId };
}

export async function findOauthClient(
  clientId: string,
): Promise<{ redirectUris: string[] } | null> {
  const rows = await getDatabase()
    .select({ redirectUris: oauthClients.redirectUris })
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { redirectUris: JSON.parse(row.redirectUris) as string[] };
}

export async function insertOauthCode(row: {
  codeHash: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  expiresAt: Date;
}): Promise<void> {
  await getDatabase().insert(oauthCodes).values(row);
}

export async function consumeOauthCode(
  codeHash: string,
  now: Date,
): Promise<ConsumedOauthCode | null> {
  const rows = await getDatabase()
    .delete(oauthCodes)
    .where(and(eq(oauthCodes.codeHash, codeHash), gt(oauthCodes.expiresAt, now)))
    .returning({
      clientId: oauthCodes.clientId,
      redirectUri: oauthCodes.redirectUri,
      codeChallenge: oauthCodes.codeChallenge,
      resource: oauthCodes.resource,
    });
  const row = rows[0];
  if (!row) return null;
  return row;
}
