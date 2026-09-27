import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { db } from "../db.ts";
import { getBalance } from "./get-balance.ts";

test.after(async () => {
  await db.close();
});

async function insertLedger(ownerKey: string, rows: Array<{
  type: "entrada" | "saida";
  amountCents: bigint;
  occurredOn: string;
}>) {
  for (const row of rows) {
    await db.insertTransaction({
      ownerKey,
      type: row.type,
      amountCents: row.amountCents,
      occurredOn: row.occurredOn,
      description: "teste de saldo",
    });
  }
}

test("soma só o dono pedido e inclui o dia do corte", async () => {
  const ownerA = `balance-test-${randomUUID()}`;
  const ownerB = `balance-test-${randomUUID()}`;
  try {
    await insertLedger(ownerA, [
      { type: "entrada", amountCents: 10000n, occurredOn: "2026-01-01" },
      { type: "saida", amountCents: 4000n, occurredOn: "2026-01-02" },
      { type: "entrada", amountCents: 1000n, occurredOn: "2026-02-01" },
    ]);
    await insertLedger(ownerB, [
      { type: "entrada", amountCents: 99900n, occurredOn: "2026-01-01" },
    ]);

    assert.deepEqual(await getBalance({ ownerKey: ownerA }), { saldoCents: 7000n });
    assert.deepEqual(await getBalance({ ownerKey: ownerA, ate: "2026-01-02" }), {
      saldoCents: 6000n,
    });
    assert.deepEqual(await getBalance({ ownerKey: ownerA, ate: "2026-01-01" }), {
      saldoCents: 10000n,
    });
    assert.deepEqual(await getBalance({ ownerKey: ownerA, ate: "2025-12-31" }), {
      saldoCents: 0n,
    });
    assert.deepEqual(await getBalance({ ownerKey: ownerB }), { saldoCents: 99900n });
    assert.deepEqual(await getBalance({ ownerKey: `balance-test-${randomUUID()}` }), {
      saldoCents: 0n,
    });
  } finally {
    await db.deleteByOwners([ownerA, ownerB]);
  }
});

test("saldo negativo devolve centavos negativos", async () => {
  const ownerKey = `balance-test-${randomUUID()}`;
  try {
    await insertLedger(ownerKey, [
      { type: "entrada", amountCents: 100n, occurredOn: "2026-03-01" },
      { type: "saida", amountCents: 150n, occurredOn: "2026-03-02" },
    ]);
    assert.deepEqual(await getBalance({ ownerKey }), { saldoCents: -50n });
  } finally {
    await db.deleteByOwners([ownerKey]);
  }
});
