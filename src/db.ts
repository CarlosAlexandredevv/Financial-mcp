import "server-only";

import { and, eq, inArray, lte, sql } from "drizzle-orm";

import { readCents } from "@/balance/balance";
import { closeDatabase, getDatabase } from "@/db/client";
import { transactions } from "@/db/schema";

const GENERIC_WRITE_ERROR = "Não foi possível registrar o lançamento.";
const GENERIC_READ_ERROR = "Não foi possível consultar o saldo.";

export type TransactionRow = {
  ownerKey: string;
  type: "entrada" | "saida";
  amountCents: bigint;
  occurredOn: string;
  description: string;
};

async function insertTransaction(row: TransactionRow): Promise<{ id: string }> {
  const rows = await getDatabase()
    .insert(transactions)
    .values(row)
    .returning({ id: transactions.id });

  const inserted = rows[0];
  if (!inserted) throw new Error(GENERIC_WRITE_ERROR);
  return { id: inserted.id };
}

async function sumBalance(input: {
  ownerKey: string;
  ate?: string;
}): Promise<bigint> {
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
  return readCents(row.saldoCents);
}

async function deleteByOwners(ownerKeys: string[]): Promise<void> {
  if (ownerKeys.length === 0) return;
  await getDatabase()
    .delete(transactions)
    .where(inArray(transactions.ownerKey, ownerKeys));
}

export const db = {
  insertTransaction,
  sumBalance,
  deleteByOwners,
  close: closeDatabase,
};
