import "server-only";

import { db } from "@/db";
import { transactions } from "@/db/schema";
import type { ParsedTransaction } from "@/transactions/parse-transaction";

export async function addTransaction(input: {
  ownerKey: string;
  transaction: ParsedTransaction;
}): Promise<{ id: string }> {
  const rows = await db
    .insert(transactions)
    .values({
      ownerKey: input.ownerKey,
      type: input.transaction.tipo,
      amountCents: input.transaction.amountCents,
      occurredOn: input.transaction.data,
      description: input.transaction.descricao,
    })
    .returning({ id: transactions.id });

  const row = rows[0];
  if (!row) {
    throw new Error("Não foi possível registrar o lançamento.");
  }

  return { id: row.id };
}
