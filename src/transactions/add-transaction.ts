import "server-only";

import { getDatabase } from "@/db/client";
import { transactions } from "@/db/schema";
import type { ParsedTransaction } from "@/transactions/parse-transaction";

const GENERIC_WRITE_ERROR = "Não foi possível registrar o lançamento.";

export async function addTransaction(input: {
  ownerKey: string;
  transaction: ParsedTransaction;
}): Promise<{ id: string }> {
  const rows = await getDatabase()
    .insert(transactions)
    .values({
      ownerKey: input.ownerKey,
      type: input.transaction.tipo,
      amountCents: input.transaction.amountCents,
      occurredOn: input.transaction.data,
      description: input.transaction.descricao,
    })
    .returning({ id: transactions.id });

  const inserted = rows[0];
  if (!inserted) throw new Error(GENERIC_WRITE_ERROR);
  return { id: inserted.id };
}
