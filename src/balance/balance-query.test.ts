import assert from "node:assert/strict";
import test from "node:test";

import { QueryBuilder } from "drizzle-orm/pg-core";

import { transactions } from "../db/schema.ts";
import { balanceOwnerFilter, signedBalanceCents } from "./balance-query.ts";

const qb = new QueryBuilder();

function statement(input: { ownerKey: string; ate?: string }) {
  return qb
    .select({
      saldoCents: signedBalanceCents(transactions.type, transactions.amountCents),
    })
    .from(transactions)
    .where(
      balanceOwnerFilter({
        ownerKey: input.ownerKey,
        ate: input.ate,
        ownerKeyColumn: transactions.ownerKey,
        occurredOnColumn: transactions.occurredOn,
      }),
    )
    .toSQL();
}

test("soma o histórico só do dono informado", () => {
  assert.deepEqual(statement({ ownerKey: "owner-a" }), {
    sql: "select coalesce(sum(case when \"type\" = 'entrada' then \"amount_cents\" else -\"amount_cents\" end), 0)::bigint from \"transactions\" where \"transactions\".\"owner_key\" = $1",
    params: ["owner-a"],
  });
});

test("corta em occurred_on inclusive quando ate vem preenchido", () => {
  assert.deepEqual(statement({ ownerKey: "owner-a", ate: "2026-01-02" }), {
    sql: "select coalesce(sum(case when \"type\" = 'entrada' then \"amount_cents\" else -\"amount_cents\" end), 0)::bigint from \"transactions\" where (\"transactions\".\"owner_key\" = $1 and \"transactions\".\"occurred_on\" <= $2)",
    params: ["owner-a", "2026-01-02"],
  });
});
