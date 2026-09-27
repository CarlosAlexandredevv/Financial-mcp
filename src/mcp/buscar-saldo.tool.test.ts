import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { BalanceLoader } from "../balance/balance.ts";
import { createFinancialMcpServer } from "./server.ts";

async function callBuscarSaldo(
  loadBalance: BalanceLoader,
  args: Record<string, unknown>,
) {
  const server = createFinancialMcpServer("dono-do-servidor", { loadBalance });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "balance-test", version: "0.0.0" });
  await client.connect(clientTransport);
  try {
    return await client.callTool({ name: "buscar_saldo", arguments: args });
  } finally {
    await client.close();
    await server.close();
  }
}

test("a tool devolve o saldo do dono do servidor", async () => {
  const calls: Array<{ ownerKey: string; ate?: string }> = [];
  const result = await callBuscarSaldo(async (query) => {
    calls.push(query);
    return { saldoCents: 15050n };
  }, { ate: "2026-09-26", ownerKey: "outro-dono" });

  assert.deepEqual(calls, [{ ownerKey: "dono-do-servidor", ate: "2026-09-26" }]);
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.content, [
    { type: "text", text: "{\"saldo\":\"150.50\",\"ate\":\"2026-09-26\"}" },
  ]);
});

test("ate inválido não chama o loader", async () => {
  let called = false;
  const result = await callBuscarSaldo(async () => {
    called = true;
    return { saldoCents: 1n };
  }, { ate: "2026-02-31" });

  assert.equal(called, false);
  assert.equal(result.isError, true);
  assert.deepEqual(result.content, [
    { type: "text", text: "ate deve estar no formato YYYY-MM-DD e ser um dia válido." },
  ]);
});

test("erro do loader não vaza a conexão", async () => {
  const result = await callBuscarSaldo(async () => {
    throw new Error("postgresql://financial:financial@localhost:5432/financial");
  }, {});

  assert.equal(result.isError, true);
  const text = result.content[0] && "text" in result.content[0] ? result.content[0].text : "";
  assert.equal(text, "Não foi possível consultar o saldo.");
  assert.equal(text.includes("postgresql"), false);
});
