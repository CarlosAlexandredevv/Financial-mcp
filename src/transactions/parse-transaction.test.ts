import assert from "node:assert/strict";
import test from "node:test";

import { formatAmount, parseTransaction } from "./parse-transaction.ts";

const nowBeforeMidnightInSaoPaulo = new Date("2026-09-26T02:30:00.000Z");

test("aceita entrada numérica e formata duas casas", () => {
  const result = parseTransaction(
    { tipo: "entrada", valor: 150.5, descricao: " salário ", data: "2026-09-26" },
    nowBeforeMidnightInSaoPaulo,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.transaction, {
    tipo: "entrada",
    amountCents: 15050n,
    data: "2026-09-26",
    descricao: "salário",
  });
  assert.equal(formatAmount(result.transaction.amountCents), "150.50");
});

test("aceita saída em string decimal e 0.50", () => {
  const saida = parseTransaction({
    tipo: "saida",
    valor: "150.50",
    descricao: "mercado",
    data: "2026-01-02",
  });
  const meioReal = parseTransaction({
    tipo: "entrada",
    valor: "0.50",
    descricao: "ajuste",
    data: "2026-01-02",
  });
  assert.equal(saida.ok && saida.transaction.amountCents, 15050n);
  assert.equal(meioReal.ok && meioReal.transaction.amountCents, 50n);
  assert.equal(formatAmount(50n), "0.50");
});

test("data ausente ou vazia usa o dia civil de America/Sao_Paulo", () => {
  const omitted = parseTransaction(
    { tipo: "entrada", valor: "1", descricao: "hoje" },
    nowBeforeMidnightInSaoPaulo,
  );
  const empty = parseTransaction(
    { tipo: "entrada", valor: "1", descricao: "hoje", data: "" },
    nowBeforeMidnightInSaoPaulo,
  );
  assert.equal(omitted.ok && omitted.transaction.data, "2026-09-25");
  assert.equal(empty.ok && empty.transaction.data, "2026-09-25");
});

test("aceita o teto de 1_000_000_000_000 centavos", () => {
  const result = parseTransaction({
    tipo: "entrada",
    valor: "10000000000",
    descricao: "teto",
    data: "2026-09-26",
  });
  assert.equal(result.ok && result.transaction.amountCents, 1_000_000_000_000n);
});

test("rejeita tipo, valor, data e descrição inválidos", () => {
  const cases: Array<{ input: Record<string, unknown>; field: string }> = [
    { input: { valor: "1", descricao: "a", data: "2026-09-26" }, field: "tipo" },
    { input: { tipo: "Entrada", valor: "1", descricao: "a", data: "2026-09-26" }, field: "tipo" },
    { input: { tipo: "entrada", descricao: "a", data: "2026-09-26" }, field: "valor" },
    { input: { tipo: "entrada", valor: "0150", descricao: "a", data: "2026-09-26" }, field: "valor" },
    { input: { tipo: "entrada", valor: "00.50", descricao: "a", data: "2026-09-26" }, field: "valor" },
    { input: { tipo: "entrada", valor: "0", descricao: "a", data: "2026-09-26" }, field: "valor" },
    { input: { tipo: "entrada", valor: "0.00", descricao: "a", data: "2026-09-26" }, field: "valor" },
    { input: { tipo: "entrada", valor: -1, descricao: "a", data: "2026-09-26" }, field: "valor" },
    { input: { tipo: "entrada", valor: Number.NaN, descricao: "a", data: "2026-09-26" }, field: "valor" },
    { input: { tipo: "entrada", valor: 1.005, descricao: "a", data: "2026-09-26" }, field: "valor" },
    { input: { tipo: "entrada", valor: "10000000000.01", descricao: "a", data: "2026-09-26" }, field: "valor" },
    { input: { tipo: "entrada", valor: "1", descricao: "a", data: "2026-02-31" }, field: "data" },
    { input: { tipo: "entrada", valor: "1", descricao: "a", data: "2026-9-01" }, field: "data" },
    { input: { tipo: "entrada", valor: "1", descricao: "   ", data: "2026-09-26" }, field: "descricao" },
    { input: { tipo: "entrada", valor: "1", descricao: "a".repeat(281), data: "2026-09-26" }, field: "descricao" },
  ];

  for (const { input, field } of cases) {
    const result = parseTransaction(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    if (result.ok) continue;
    assert.match(result.message, new RegExp(field));
  }
});

test("aceita descrição de 280 caracteres depois do trim", () => {
  const result = parseTransaction({
    tipo: "saida",
    valor: 10,
    descricao: ` ${"a".repeat(280)} `,
    data: "2026-09-26",
  });
  assert.equal(result.ok && result.transaction.descricao.length, 280);
});
