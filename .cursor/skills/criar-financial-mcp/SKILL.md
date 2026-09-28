---
name: criar-financial-mcp
description: Cria tool MCP, tabela Drizzle ou módulo de domínio no Financial MCP seguindo o fluxo existente (schema, parse sem banco, query com filtro por dono, registro da tool, teste e README). Use ao adicionar ou alterar tool, lançamento, saldo, schema, migração, módulo de servidor ou qualquer leitura/escrita financeira neste repositório.
---

# Criar no Financial MCP

A fonte de verdade é o PostgreSQL. O modelo manda critérios; o servidor monta o SQL, restringe ao dono autenticado e devolve só o recorte. `ownerKey` sai da autenticação em `src/app/mcp/route.ts` e entra em `createFinancialMcpServer`. Argumento de tool não escolhe dono.

## Decidir o que muda

- Dado novo persistido → schema, depois o módulo.
- Critério ou formato novo, sem coluna nova → parse e query existentes.
- Superfície nova para o modelo → tool em `src/mcp/server.ts`, com parse e loader.

Não crie rota, cliente de banco nem checagem de segredo para uma tool. `/mcp` já autentica e passa `ownerKey`.

## Ordem

1. Schema, se a forma persistida mudou.
2. Parse e formato, sem `server-only` e sem `getDatabase`.
3. Query ou insert em arquivo com `import "server-only"`.
4. Registro da tool, se o modelo precisa chamá-la.
5. Testes.
6. Uma linha na tabela Tools do `README.md`, se a tool é nova ou o contrato mudou.

## Schema

Edite só `src/db/schema.ts`. Gere a migração com `npm run db:generate`. Não escreva SQL à mão.

Linha financeira:

- `ownerKey: text("owner_key").notNull()`
- dinheiro em centavos: `bigint(..., { mode: "bigint" })`
- dia civil: `date(..., { mode: "string" })` (`YYYY-MM-DD`)
- índice que começa por `ownerKey`

Colunas do banco em inglês (`type`, `amountCents`, `occurredOn`). O contrato da tool em português (`tipo`, `valor`, `data`, `descricao`).

## Parse

Fica no módulo de domínio, sem banco, para o teste da tool injetar um loader.

- Entrada `unknown`. Saída `{ ok: true, ... } | { ok: false, message }`.
- Mensagem curta, em português, dizendo o campo e a regra. Sem segredo, SQL ou `DATABASE_URL`.
- `valor` do modelo é string decimal positiva; no servidor vira `bigint` de centavos. Resposta usa `formatAmount` / `formatSignedAmount` (`"150.50"`).
- Data `YYYY-MM-DD` validada como dia civil UTC.
- Vazio (`undefined` ou `""`) significa filtro ausente.

## Query e escrita

Arquivo separado do parse. Primeira linha: `import "server-only"`. Cliente: `getDatabase()` de `@/db/client`.

- Toda leitura e escrita filtra ou grava `ownerKey` recebido pela função. A condição do dono existe mesmo sem outros filtros.
- Filtro, ordem, agregação e `limit` acontecem no SQL.
- `select` lista colunas. Não devolva a linha inteira.
- Falha de insert/select sem linha vira `throw new Error` com texto genérico fixo. Quem chama a tool captura e devolve esse texto. O erro original não volta ao modelo.

## Tool

Registre em `createFinancialMcpServer` (`src/mcp/server.ts`). Nome `snake_case` em português. A description diz que a operação é do dono autenticado.

- `inputSchema`: cada argumento `z.unknown().optional()`. A validação é o parse, não o Zod.
- O handler usa o `ownerKey` do argumento da factory. Ignore `ownerKey` se vier nos args.
- Leitura recebe o loader por parâmetro (`loadBalance`, `loadTransactions` ou o próximo no mesmo objeto `deps`), com default no módulo `server-only`.
- Sucesso: `{ content: [{ type: "text", text: JSON.stringify(body) }] }`.
- Erro de parse ou de banco: `{ isError: true, content: [{ type: "text", text }] }`.
- O JSON repete só os filtros que o cliente enviou e o recorte pedido.

## Testes

`node:test` e `node:assert/strict`. Arquivo `src/**/*.test.ts`. Rode `npm test`.

Tool (`src/mcp/<nome>.tool.test.ts`), com `InMemoryTransport` e loader falso, como `buscar-saldo.tool.test.ts`:

- o loader recebe o `ownerKey` do servidor, mesmo que os args tragam outro
- argumento inválido não chama o loader
- `throw new Error` com a URL do banco vira a mensagem genérica, sem `postgresql`

Parse: teste o módulo puro, sem banco.

SQL (`get-*.test.ts`): se não houver `DATABASE_URL`, `skip`. Apague as linhas dos `ownerKey` criados no teste.

## Fora deste fluxo

OAuth, consentimento e o transporte em `src/app/mcp/route.ts` não acompanham uma tool ou tabela financeira nova.
