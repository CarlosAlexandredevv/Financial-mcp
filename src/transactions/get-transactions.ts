import "server-only";

import { and, desc, eq, gte, lte } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { transactions } from "@/db/schema";
import type { TransactionsLoader } from "@/transactions/list-transactions";

export const getTransactions: TransactionsLoader = async (input) => {
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
};
