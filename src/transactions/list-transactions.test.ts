import assert from "node:assert/strict";
import test from "node:test";

import { listarTransacoes, parseListQuery } from "./list-transactions.ts";

test("aceita filtros ausentes e usa limite 50", () => {
  assert.deepEqual(parseListQuery({}), {
    ok: true,
    query: { de: undefined, ate: undefined, tipo: undefined, limite: 50, echo: {} },
  });
  assert.deepEqual(parseListQuery({ limite: undefined }), {
    ok: true,
    query: { de: undefined, ate: undefined, tipo: undefined, limite: 50, echo: {} },
  });
});

test("aceita de, ate, tipo e limite válidos", () => {
  assert.deepEqual(
    parseListQuery({
      de: "2026-01-01",
      ate: "2026-01-31",
      tipo: "saida",
      limite: 10,
    }),
    {
      ok: true,
      query: {
        de: "2026-01-01",
        ate: "2026-01-31",
        tipo: "saida",
        limite: 10,
        echo: { de: "2026-01-01", ate: "2026-01-31", tipo: "saida" },
      },
    },
  );
});

test("rejeita datas, intervalo, tipo e limite inválidos", () => {
  assert.deepEqual(parseListQuery({ de: "2026-02-31" }), {
    ok: false,
    message: "de deve estar no formato YYYY-MM-DD e ser um dia válido.",
  });
  assert.deepEqual(parseListQuery({ ate: "2026-9-01" }), {
    ok: false,
    message: "ate deve estar no formato YYYY-MM-DD e ser um dia válido.",
  });
  assert.deepEqual(
    parseListQuery({ de: "2026-02-01", ate: "2026-01-01" }),
    { ok: false, message: "de não pode ser posterior a ate." },
  );
  assert.deepEqual(parseListQuery({ tipo: "despesa" }), {
    ok: false,
    message: "tipo deve ser entrada ou saida.",
  });
  for (const limite of [0, 51, 1.5, "0", "51", null]) {
    assert.deepEqual(parseListQuery({ limite }), {
      ok: false,
      message: "limite deve ser um inteiro de 1 a 50.",
    });
  }
});

test("consulta inválida não chama o loader", async () => {
  let called = false;
  const result = await listarTransacoes({
    ownerKey: "dono",
    args: { de: "2026-02-31" },
    load: async () => {
      called = true;
      return { transacoes: [] };
    },
  });

  assert.equal(called, false);
  assert.deepEqual(result, {
    isError: true,
    content: [{ type: "text", text: "de deve estar no formato YYYY-MM-DD e ser um dia válido." }],
  });
});

test("devolve transações do ownerKey da função e ecoa só filtros pedidos", async () => {
  const calls: Array<{
    ownerKey: string;
    de?: string;
    ate?: string;
    tipo?: "entrada" | "saida";
    limite: number;
  }> = [];
  const load = async (query: {
    ownerKey: string;
    de?: string;
    ate?: string;
    tipo?: "entrada" | "saida";
    limite: number;
  }) => {
    calls.push(query);
    return {
      transacoes: [
        {
          id: "tx-1",
          tipo: "saida" as const,
          amountCents: 1250n,
          data: "2026-09-28",
          descricao: "padaria",
        },
      ],
    };
  };

  const result = await listarTransacoes({
    ownerKey: "dono-autenticado",
    args: {
      ate: "2026-09-28",
      tipo: "saida",
      limite: 5,
      ownerKey: "outro-dono",
    } as ListQueryInputWithSpoof,
    load,
  });

  assert.deepEqual(calls, [
    {
      ownerKey: "dono-autenticado",
      de: undefined,
      ate: "2026-09-28",
      tipo: "saida",
      limite: 5,
    },
  ]);
  assert.deepEqual(result, {
    content: [
      {
        type: "text",
        text:
          '{"transacoes":[{"id":"tx-1","tipo":"saida","valor":"12.50","data":"2026-09-28","descricao":"padaria"}],"limite":5,"ate":"2026-09-28","tipo":"saida"}',
      },
    ],
  });
});

test("lista vazia sem ecoar filtros omitidos", async () => {
  const result = await listarTransacoes({
    ownerKey: "dono",
    args: {},
    load: async () => ({ transacoes: [] }),
  });

  assert.deepEqual(result, {
    content: [{ type: "text", text: '{"transacoes":[],"limite":50}' }],
  });
});

test("falha de leitura vira mensagem genérica", async () => {
  const result = await listarTransacoes({
    ownerKey: "dono",
    args: {},
    load: async () => {
      throw new Error("postgresql://financial:financial@localhost:5432/financial");
    },
  });

  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, "Não foi possível listar os lançamentos.");
  assert.equal(result.content[0].text.includes("postgresql"), false);
});

type ListQueryInputWithSpoof = {
  ate?: unknown;
  tipo?: unknown;
  limite?: unknown;
  ownerKey?: unknown;
};
