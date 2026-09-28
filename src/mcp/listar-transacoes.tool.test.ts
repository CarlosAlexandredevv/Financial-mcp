import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { TransactionsLoader } from "../transactions/list-transactions.ts";
import { createFinancialMcpServer } from "./server.ts";

async function callListarTransacoes(
  loadTransactions: TransactionsLoader,
  args: Record<string, unknown>,
) {
  const server = createFinancialMcpServer("dono-do-servidor", {
    loadTransactions,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "list-test", version: "0.0.0" });
  await client.connect(clientTransport);
  try {
    return await client.callTool({ name: "listar_transacoes", arguments: args });
  } finally {
    await client.close();
    await server.close();
  }
}

test("a tool devolve lançamentos do dono do servidor", async () => {
  const calls: Array<{
    ownerKey: string;
    de?: string;
    ate?: string;
    tipo?: "entrada" | "saida";
    limite: number;
  }> = [];
  const result = await callListarTransacoes(async (query) => {
    calls.push(query);
    return {
      transacoes: [
        {
          id: "abc",
          tipo: "entrada",
          amountCents: 100n,
          data: "2026-09-28",
          descricao: "freela",
        },
      ],
    };
  }, { ate: "2026-09-28", limite: 3, ownerKey: "outro-dono" });

  assert.deepEqual(calls, [
    {
      ownerKey: "dono-do-servidor",
      de: undefined,
      ate: "2026-09-28",
      tipo: undefined,
      limite: 3,
    },
  ]);
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.content, [
    {
      type: "text",
      text:
        '{"transacoes":[{"id":"abc","tipo":"entrada","valor":"1.00","data":"2026-09-28","descricao":"freela"}],"limite":3,"ate":"2026-09-28"}',
    },
  ]);
});

test("de inválido não chama o loader", async () => {
  let called = false;
  const result = await callListarTransacoes(async () => {
    called = true;
    return { transacoes: [] };
  }, { de: "2026-02-31" });

  assert.equal(called, false);
  assert.equal(result.isError, true);
  assert.deepEqual(result.content, [
    { type: "text", text: "de deve estar no formato YYYY-MM-DD e ser um dia válido." },
  ]);
});

test("erro do loader não vaza a conexão", async () => {
  const result = await callListarTransacoes(async () => {
    throw new Error("postgresql://financial:financial@localhost:5432/financial");
  }, {});

  assert.equal(result.isError, true);
  const text = result.content[0] && "text" in result.content[0] ? result.content[0].text : "";
  assert.equal(text, "Não foi possível listar os lançamentos.");
  assert.equal(text.includes("postgresql"), false);
});
