import "server-only";

import { db } from "@/db";
import type { ParsedTransaction } from "@/transactions/parse-transaction";

export async function addTransaction(input: {
  ownerKey: string;
  transaction: ParsedTransaction;
}): Promise<{ id: string }> {
  return db.insertTransaction({
    ownerKey: input.ownerKey,
    type: input.transaction.tipo,
    amountCents: input.transaction.amountCents,
    occurredOn: input.transaction.data,
    description: input.transaction.descricao,
  });
}
