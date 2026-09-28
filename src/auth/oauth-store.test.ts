import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { config } from "dotenv";

import { eq } from "drizzle-orm";

import { closeDatabase, getDatabase } from "../db/client.ts";
import { oauthClients, oauthCodes } from "../db/schema.ts";
import {
  consumeOauthCode,
  insertOauthClient,
  insertOauthCode,
} from "./oauth-store.ts";

config({ path: ".env.local" });
config({ path: ".env" });

const dbTest = process.env.DATABASE_URL ? {} : { skip: "DATABASE_URL ausente" };

test.after(async () => {
  if (process.env.DATABASE_URL) await closeDatabase();
});

test("consumeOauthCode devolve a linha uma vez", dbTest, async () => {
  const { clientId } = await insertOauthClient(["https://app/cb"]);
  const plainCode = randomBytes(32).toString("base64url");
  const codeHash = createHash("sha256").update(plainCode, "utf8").digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  try {
    await insertOauthCode({
      codeHash,
      clientId,
      redirectUri: "https://app/cb",
      codeChallenge: "challenge",
      resource: "https://exemplo.com/mcp",
      expiresAt,
    });

    const first = await consumeOauthCode(codeHash, new Date());
    assert.deepEqual(first, {
      clientId,
      redirectUri: "https://app/cb",
      codeChallenge: "challenge",
      resource: "https://exemplo.com/mcp",
    });

    const second = await consumeOauthCode(codeHash, new Date());
    assert.equal(second, null);
  } finally {
    await getDatabase()
      .delete(oauthCodes)
      .where(eq(oauthCodes.clientId, clientId));
    await getDatabase()
      .delete(oauthClients)
      .where(eq(oauthClients.clientId, clientId));
  }
});
