import "server-only";

import { db } from "@/db";

export async function getBalance(input: {
  ownerKey: string;
  ate?: string;
}): Promise<{ saldoCents: bigint }> {
  return { saldoCents: await db.sumBalance(input) };
}
