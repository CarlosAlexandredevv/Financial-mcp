import assert from "node:assert/strict";
import test from "node:test";

import {
  buscarSaldo,
  formatSignedAmount,
  parseBalanceQuery,
  readCents,
} from "./balance.ts";

test("formata centavos com sinal e duas casas", () => {
  assert.equal(formatSignedAmount(0n), "0.00");
  assert.equal(formatSignedAmount(15050n), "150.50");
  assert.equal(formatSignedAmount(50n), "0.50");
  assert.equal(formatSignedAmount(-50n), "-0.50");
  assert.equal(formatSignedAmount(-15050n), "-150.50");
});

test("lê centavos vindos do driver", () => {
  assert.equal(readCents(0n), 0n);
  assert.equal(readCents(-50n), -50n);
  assert.equal(readCents("15050"), 15050n);
  assert.equal(readCents("-50"), -50n);
  assert.equal(readCents(70), 70n);
  assert.throws(() => readCents("70.00"), /consultar o saldo/);
  assert.throws(() => readCents(1.5), /consultar o saldo/);
  assert.throws(() => readCents(null), /consultar o saldo/);
});

test("aceita ate ausente, vazio ou dia civil válido", () => {
  assert.deepEqual(parseBalanceQuery({}), { ok: true });
  assert.deepEqual(parseBalanceQuery({ ate: undefined }), { ok: true });
  assert.deepEqual(parseBalanceQuery({ ate: "" }), { ok: true });
  assert.deepEqual(parseBalanceQuery({ ate: "2026-01-02" }), {
    ok: true,
    ate: "2026-01-02",
  });
  assert.deepEqual(parseBalanceQuery({ ate: "2026-12-31" }), {
    ok: true,
    ate: "2026-12-31",
  });
});

test("rejeita ate inválido", () => {
  const message = "ate deve estar no formato YYYY-MM-DD e ser um dia válido.";
  for (const ate of [null, 20260102, "2026-02-31", "2026-9-01", " 2026-01-02", "2026-01-02T00:00:00Z"]) {
    assert.deepEqual(parseBalanceQuery({ ate }), { ok: false, message });
  }
});

test("ate inválido não consulta o saldo", async () => {
  let called = false;
  const result = await buscarSaldo({
    ownerKey: "dono",
    args: { ate: "2026-02-31" },
    load: async () => {
      called = true;
      return { saldoCents: 1n };
    },
  });

  assert.equal(called, false);
  assert.deepEqual(result, {
    isError: true,
    content: [{ type: "text", text: "ate deve estar no formato YYYY-MM-DD e ser um dia válido." }],
  });
});

test("devolve o saldo do ownerKey da função e ecoa ate só quando há corte", async () => {
  const calls: Array<{ ownerKey: string; ate?: string }> = [];
  const load = async (query: { ownerKey: string; ate?: string }) => {
    calls.push(query);
    return { saldoCents: query.ate === undefined ? 7000n : -50n };
  };

  const historico = await buscarSaldo({
    ownerKey: "dono-autenticado",
    args: { ate: "", ownerKey: "outro-dono" } as { ate?: unknown },
    load,
  });
  const corte = await buscarSaldo({
    ownerKey: "dono-autenticado",
    args: { ate: "2026-01-02", ownerKey: "outro-dono" } as { ate?: unknown },
    load,
  });

  assert.deepEqual(calls, [
    { ownerKey: "dono-autenticado", ate: undefined },
    { ownerKey: "dono-autenticado", ate: "2026-01-02" },
  ]);
  assert.deepEqual(historico, {
    content: [{ type: "text", text: "{\"saldo\":\"70.00\"}" }],
  });
  assert.deepEqual(corte, {
    content: [{ type: "text", text: "{\"saldo\":\"-0.50\",\"ate\":\"2026-01-02\"}" }],
  });
});

test("falha de leitura vira mensagem genérica", async () => {
  const result = await buscarSaldo({
    ownerKey: "dono",
    args: {},
    load: async () => {
      throw new Error("postgresql://financial:financial@localhost:5432/financial");
    },
  });

  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, "Não foi possível consultar o saldo.");
  assert.equal(result.content[0].text.includes("postgresql"), false);
  assert.equal(result.content[0].text.includes("financial"), false);
});
