import "server-only";

import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

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

async function listTransactions(input: {
  ownerKey: string;
  de?: string;
  ate?: string;
  tipo?: "entrada" | "saida";
  limite: number;
}): Promise<{
  transacoes: Array<{
    id: string;
    tipo: "entrada" | "saida";
    amountCents: bigint;
    data: string;
    descricao: string;
  }>;
}> {
  const conditions = [eq(transactions.ownerKey, input.ownerKey)];
  if (input.de !== undefined) {
    conditions.push(gte(transactions.occurredOn, input.de));
  }
  if (input.ate !== undefined) {
    conditions.push(lte(transactions.occurredOn, input.ate));
  }
  if (input.tipo !== undefined) {
    conditions.push(eq(transactions.type, input.tipo));
  }

  const rows = await getDatabase()
    .select({
      id: transactions.id,
      tipo: transactions.type,
      amountCents: transactions.amountCents,
      data: transactions.occurredOn,
      descricao: transactions.description,
    })
    .from(transactions)
    .where(and(...conditions))
    .orderBy(
      desc(transactions.occurredOn),
      desc(transactions.createdAt),
      desc(transactions.id),
    )
    .limit(input.limite);

  return {
    transacoes: rows.map((row) => ({
      id: row.id,
      tipo: row.tipo,
      amountCents: row.amountCents,
      data: row.data,
      descricao: row.descricao,
    })),
  };
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
  listTransactions,
  deleteByOwners,
  close: closeDatabase,
};
