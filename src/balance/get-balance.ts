import "server-only";

import { and, eq, lte, sql } from "drizzle-orm";

import { readCents } from "@/balance/balance";
import { getDatabase } from "@/db/client";
import { transactions } from "@/db/schema";

const GENERIC_READ_ERROR = "Não foi possível consultar o saldo.";

export async function getBalance(input: {
  ownerKey: string;
  ate?: string;
}): Promise<{ saldoCents: bigint }> {
  const signedSum = sql`coalesce(sum(case when ${transactions.type} = 'entrada' then ${transactions.amountCents} else -${transactions.amountCents} end), 0)::bigint`;
  const owner = eq(transactions.ownerKey, input.ownerKey);
  const where =
    input.ate === undefined
      ? owner
      : and(owner, lte(transactions.occurredOn, input.ate));
  if (where === undefined) throw new Error(GENERIC_READ_ERROR);

  const rows = await getDatabase()
    .select({ saldoCents: signedSum })
    .from(transactions)
    .where(where);

  const row = rows[0];
  if (!row) throw new Error(GENERIC_READ_ERROR);
  return { saldoCents: readCents(row.saldoCents) };
}
