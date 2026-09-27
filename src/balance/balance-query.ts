import { and, eq, lte, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

const GENERIC_READ_ERROR = "Não foi possível consultar o saldo.";

export function signedBalanceCents(typeColumn: PgColumn, amountColumn: PgColumn) {
  return sql`coalesce(sum(case when ${typeColumn} = 'entrada' then ${amountColumn} else -${amountColumn} end), 0)::bigint`;
}

export function balanceOwnerFilter(input: {
  ownerKey: string;
  ate?: string;
  ownerKeyColumn: PgColumn;
  occurredOnColumn: PgColumn;
}): SQL {
  const owner = eq(input.ownerKeyColumn, input.ownerKey);
  if (input.ate === undefined) return owner;

  const filtered = and(owner, lte(input.occurredOnColumn, input.ate));
  if (filtered === undefined) throw new Error(GENERIC_READ_ERROR);
  return filtered;
}
