import "server-only";

import { db } from "@/db";
import type { TransactionsLoader } from "@/transactions/list-transactions";

export const getTransactions: TransactionsLoader = async (input) =>
  db.listTransactions(input);
