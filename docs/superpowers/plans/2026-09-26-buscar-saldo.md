# Buscar saldo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor a tool MCP `buscar_saldo`, que devolve o saldo do dono autenticado agregado em SQL.

**Architecture:** A validação de `ate`, a formatação e a resposta da tool ficam em `src/balance/balance.ts`, sem banco. `src/balance/balance-query.ts` monta a soma e o filtro. `src/balance/get-balance.ts` executa no PostgreSQL. `src/mcp/server.ts` registra a tool com o `ownerKey` já derivado do segredo.

**Tech Stack:** Next.js, MCP SDK, Zod, Drizzle ORM, PostgreSQL 17, `node:test`, `tsx` só para os testes que importam módulos com alias `@/`.

## Global Constraints

- Toda agregação, filtro e ordenação acontece no servidor, em SQL, via Drizzle.
- Módulos que tocam o banco importam `server-only`.
- `DATABASE_URL` não volta em resposta de tool, página ou log.
- Sem `MCP_ACCESS_SECRET` correspondente, a chamada é recusada antes de qualquer query. A comparação do segredo permanece em tempo constante.
- O segredo identifica o dono. Argumentos da tool não escolhem o dono e não ampliam o escopo.
- Uma chamada autenticada enxerga apenas as linhas daquele dono.
- O valor do segredo não aparece em log, mensagem de erro nem resultado de tool.
- Resposta ao modelo traz o mínimo necessário, sem dump de lançamentos.
- Não criar tabela, coluna nem migração para o saldo.

---

### Task 1: Comportamento puro de buscar saldo

**Files:**
- Create: `src/balance/balance.ts`
- Create: `src/balance/balance.test.ts`
- Modify: `package.json`
- Test: `src/balance/balance.test.ts`

**Interfaces:**
- Consumes: nada do banco. O teste injeta `load`.
- Produces:
  - `formatSignedAmount(cents: bigint): string`
  - `readCents(value: unknown): bigint`
  - `parseBalanceQuery(input: { ate?: unknown }): { ok: true; ate?: string } | { ok: false; message: string }`
  - `BalanceLoader = (query: { ownerKey: string; ate?: string }) => Promise<{ saldoCents: bigint }>`
  - `buscarSaldo(input: { ownerKey: string; args: { ate?: unknown }; load: BalanceLoader }): Promise<{ isError?: true; content: [{ type: "text"; text: string }] }>`

- [ ] **Step 1: Write the failing test**

Create `src/balance/balance.test.ts`:

```typescript
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
```

Add `src/balance/balance.test.ts` to the `test` script in `package.json`:

```json
"test": "node --conditions=react-server --experimental-strip-types --test src/auth/access-secret.test.ts src/transactions/parse-transaction.test.ts src/balance/balance.test.ts"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL because `./balance.ts` cannot be resolved.

- [ ] **Step 3: Write minimal implementation**

Create `src/balance/balance.ts`:

```typescript
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ATE_MESSAGE = "ate deve estar no formato YYYY-MM-DD e ser um dia válido.";
const GENERIC_READ_ERROR = "Não foi possível consultar o saldo.";
const INTEGER_CENTS = /^-?\d+$/;

export type BalanceLoader = (query: {
  ownerKey: string;
  ate?: string;
}) => Promise<{ saldoCents: bigint }>;

export type BalanceToolResult = {
  isError?: true;
  content: [{ type: "text"; text: string }];
};

export function formatSignedAmount(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function readCents(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && INTEGER_CENTS.test(value)) return BigInt(value);
  throw new Error(GENERIC_READ_ERROR);
}

export function parseBalanceQuery(input: { ate?: unknown }):
  | { ok: true; ate?: string }
  | { ok: false; message: string } {
  if (input.ate === undefined || input.ate === "") return { ok: true };
  if (typeof input.ate !== "string" || !isCivilDate(input.ate)) {
    return { ok: false, message: ATE_MESSAGE };
  }
  return { ok: true, ate: input.ate };
}

export async function buscarSaldo(input: {
  ownerKey: string;
  args: { ate?: unknown };
  load: BalanceLoader;
}): Promise<BalanceToolResult> {
  const parsed = parseBalanceQuery({ ate: input.args.ate });
  if (!parsed.ok) {
    return { isError: true, content: [{ type: "text", text: parsed.message }] };
  }

  try {
    const { saldoCents } = await input.load({
      ownerKey: input.ownerKey,
      ate: parsed.ate,
    });
    const body: { saldo: string; ate?: string } = {
      saldo: formatSignedAmount(saldoCents),
    };
    if (parsed.ate !== undefined) body.ate = parsed.ate;
    return { content: [{ type: "text", text: JSON.stringify(body) }] };
  } catch {
    return {
      isError: true,
      content: [{ type: "text", text: GENERIC_READ_ERROR }],
    };
  }
}

function isCivilDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS, including the existing auth and transaction tests.

- [ ] **Step 5: Commit**

```bash
git add package.json src/balance/balance.ts src/balance/balance.test.ts
git commit -m "Add pure balance parsing and signed amount formatting."
```

---

### Task 2: Fragmento SQL do saldo

**Files:**
- Create: `src/balance/balance-query.ts`
- Create: `src/balance/balance-query.test.ts`
- Modify: `package.json`
- Test: `src/balance/balance-query.test.ts`

**Interfaces:**
- Consumes: `transactions` de `src/db/schema.ts` apenas no teste. O módulo de produção recebe as colunas como argumento, para o `node:test` conseguir carregá-lo sem alias `@/`.
- Produces:
  - `signedBalanceCents(typeColumn: PgColumn, amountColumn: PgColumn): SQL`
  - `balanceOwnerFilter(input: { ownerKey: string; ate?: string; ownerKeyColumn: PgColumn; occurredOnColumn: PgColumn }): SQL`

- [ ] **Step 1: Write the failing test**

Create `src/balance/balance-query.test.ts`:

```typescript
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
```

Add the file to the `test` script:

```json
"test": "node --conditions=react-server --experimental-strip-types --test src/auth/access-secret.test.ts src/transactions/parse-transaction.test.ts src/balance/balance.test.ts src/balance/balance-query.test.ts"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL because `./balance-query.ts` cannot be resolved.

- [ ] **Step 3: Write minimal implementation**

Create `src/balance/balance-query.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS. The SQL string is o que o Drizzle 0.45.3 gera para essa expressão. Se uma versão futura mudar o SQL, ajuste a asserção para o texto novo e mantenha três fatos: a soma com sinal, o parâmetro do dono e `occurred_on <=` só quando há `ate`.

- [ ] **Step 5: Commit**

```bash
git add package.json src/balance/balance-query.ts src/balance/balance-query.test.ts
git commit -m "Build the owner-scoped balance aggregate in SQL."
```

---

### Task 3: getBalance contra PostgreSQL

**Files:**
- Create: `src/balance/get-balance.ts`
- Create: `src/balance/get-balance.test.ts`
- Modify: `package.json`
- Test: `src/balance/get-balance.test.ts`

**Interfaces:**
- Consumes: `signedBalanceCents` e `balanceOwnerFilter` de `src/balance/balance-query.ts`; `readCents` de `src/balance/balance.ts`; `db` e `transactions`.
- Produces: `getBalance(input: { ownerKey: string; ate?: string }): Promise<{ saldoCents: bigint }>`

- [ ] **Step 1: Write the failing test**

Create `src/balance/get-balance.test.ts`:

```typescript
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { inArray } from "drizzle-orm";

import { db } from "../db/index.ts";
import { transactions } from "../db/schema.ts";
import { getBalance } from "./get-balance.ts";

async function insertLedger(ownerKey: string, rows: Array<{
  type: "entrada" | "saida";
  amountCents: bigint;
  occurredOn: string;
}>) {
  await db.insert(transactions).values(
    rows.map((row) => ({
      ownerKey,
      type: row.type,
      amountCents: row.amountCents,
      occurredOn: row.occurredOn,
      description: "teste de saldo",
    })),
  );
}

async function removeOwners(ownerKeys: string[]) {
  await db.delete(transactions).where(inArray(transactions.ownerKey, ownerKeys));
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
    await removeOwners([ownerA, ownerB]);
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
    await removeOwners([ownerKey]);
  }
});
```

Add `tsx` and the database script to `package.json`. Keep the existing `test` script from Task 2 and add:

```json
"test:db": "node --conditions=react-server --import tsx --test src/balance/get-balance.test.ts"
```

Install the runner:

```bash
npm install --save-dev tsx@^4.23.15
```

- [ ] **Step 2: Run test to verify it fails**

Start PostgreSQL and migrate before the test. `.env.local` fica fora do git.

```bash
docker compose up -d
cp -n .env.example .env.local
npm run db:migrate
DATABASE_URL=postgresql://financial:financial@localhost:5432/financial npm run test:db
```

`cp -n` não sobrescreve um `.env.local` que já exista. Se o arquivo existente tiver outra `DATABASE_URL`, exporte essa URL no lugar da URL de exemplo.

Expected: FAIL because `./get-balance.ts` cannot be resolved.

- [ ] **Step 3: Write minimal implementation**

Create `src/balance/get-balance.ts`:

```typescript
import "server-only";

import { readCents } from "@/balance/balance";
import { balanceOwnerFilter, signedBalanceCents } from "@/balance/balance-query";
import { db } from "@/db";
import { transactions } from "@/db/schema";

const GENERIC_READ_ERROR = "Não foi possível consultar o saldo.";

export async function getBalance(input: {
  ownerKey: string;
  ate?: string;
}): Promise<{ saldoCents: bigint }> {
  const rows = await db
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
    );

  const row = rows[0];
  if (!row) throw new Error(GENERIC_READ_ERROR);
  return { saldoCents: readCents(row.saldoCents) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
DATABASE_URL=postgresql://financial:financial@localhost:5432/financial npm run test:db
npm test
```

Expected: PASS. `getBalance` devolve `{ saldoCents: 7000n }` no histórico do dono A, `{ saldoCents: 6000n }` no corte de `2026-01-02`, `{ saldoCents: 0n }` antes do primeiro lançamento e `{ saldoCents: -50n }` no livro negativo. `readCents` já aceita `bigint`, string inteira e número inteiro seguro, que são as formas em que o `postgres` e o Drizzle entregam um `bigint` lançado com `::bigint`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/balance/get-balance.ts src/balance/get-balance.test.ts
git commit -m "Query the authenticated owner's cash balance in Postgres."
```

---

### Task 4: Registrar buscar_saldo no servidor MCP

**Files:**
- Modify: `src/mcp/server.ts`
- Create: `src/mcp/buscar-saldo.tool.test.ts`
- Modify: `package.json`
- Test: `src/mcp/buscar-saldo.tool.test.ts`

**Interfaces:**
- Consumes: `buscarSaldo` e `BalanceLoader` de `src/balance/balance.ts`; `getBalance` de `src/balance/get-balance.ts`.
- Produces: `createFinancialMcpServer(ownerKey: string, deps?: { loadBalance?: BalanceLoader }): McpServer`. A rota em `src/app/mcp/route.ts` continua chamando `createFinancialMcpServer(decision.ownerKey)` com um argumento.

- [ ] **Step 1: Write the failing test**

Create `src/mcp/buscar-saldo.tool.test.ts`:

```typescript
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
```

Point `test:db` at both database-backed files:

```json
"test:db": "node --conditions=react-server --import tsx --test src/balance/get-balance.test.ts src/mcp/buscar-saldo.tool.test.ts"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
DATABASE_URL=postgresql://financial:financial@localhost:5432/financial npm run test:db
```

Expected: FAIL. `callTool` de `buscar_saldo` não encontra a tool, porque `createFinancialMcpServer` ainda só registra `adicionar_transacao`. O teste de query da Task 3 continua passando.

- [ ] **Step 3: Write minimal implementation**

In `src/mcp/server.ts`, add the imports and the optional dependency. Keep `adicionar_transacao` como está.

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { BalanceLoader } from "@/balance/balance";
import { buscarSaldo } from "@/balance/balance";
import { getBalance } from "@/balance/get-balance";
import { addTransaction } from "@/transactions/add-transaction";
import {
  formatAmount,
  parseTransaction,
} from "@/transactions/parse-transaction";

const GENERIC_WRITE_ERROR = "Não foi possível registrar o lançamento.";

export function createFinancialMcpServer(
  ownerKey: string,
  deps: { loadBalance?: BalanceLoader } = {},
) {
  const loadBalance = deps.loadBalance ?? getBalance;
  const server = new McpServer({
    name: "financial-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "adicionar_transacao",
    {
      description:
        "Registra um lançamento de entrada ou de saída no livro-caixa do dono autenticado.",
      inputSchema: z.object({
        tipo: z.unknown().optional(),
        valor: z.unknown().optional(),
        descricao: z.unknown().optional(),
        data: z.unknown().optional(),
      }),
    },
    async (args) => {
      const parsed = parseTransaction(args);
      if (!parsed.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: parsed.message }],
        };
      }

      try {
        const { id } = await addTransaction({
          ownerKey,
          transaction: parsed.transaction,
        });
        const body = {
          id,
          tipo: parsed.transaction.tipo,
          valor: formatAmount(parsed.transaction.amountCents),
          data: parsed.transaction.data,
          descricao: parsed.transaction.descricao,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(body) }],
        };
      } catch {
        return {
          isError: true,
          content: [{ type: "text", text: GENERIC_WRITE_ERROR }],
        };
      }
    },
  );

  server.registerTool(
    "buscar_saldo",
    {
      description:
        "Informa o saldo do livro-caixa do dono autenticado. Sem ate, soma todo o histórico. Com ate em YYYY-MM-DD, soma os lançamentos ocorridos até essa data, inclusive.",
      inputSchema: z.object({
        ate: z.unknown().optional(),
      }),
    },
    async (args) => buscarSaldo({ ownerKey, args, load: loadBalance }),
  );

  return server;
}
```

Do not change `src/app/mcp/route.ts`. One argument keeps the production loader as `getBalance`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
DATABASE_URL=postgresql://financial:financial@localhost:5432/financial npm run test:db
npm test
npx tsc --noEmit --pretty false
```

Expected: PASS. `tsc` não inclui `**/*.test.ts`. O transporte em memória confirma que um `ownerKey` mandado pelo cliente MCP não substitui o dono do servidor: o Zod da tool descarta a chave, e `buscarSaldo` só lê `args.ate`.

- [ ] **Step 5: Commit**

```bash
git add package.json src/mcp/server.ts src/mcp/buscar-saldo.tool.test.ts
git commit -m "Expose buscar_saldo on the financial MCP server."
```

---

## Self-review

Spec coverage:

- Tool `buscar_saldo` e descrição: Task 4.
- `ate` ausente, vazio, válido e inválido: Task 1 e Task 4.
- JSON mínimo, sinal e `"0.00"`: Task 1. Zero linhas no Postgres: Task 3.
- Soma com sinal, filtro de dono e corte inclusivo: Task 2 e Task 3.
- Erro genérico sem URL: Task 1 e Task 4.
- Sem migração: nenhuma task altera `src/db/schema.ts` nem `drizzle/`.
- Rota autenticada existente permanece com um argumento: Task 4.

O plano não implementa listagem, período `de`/`ate`, totais separados nem página web.
