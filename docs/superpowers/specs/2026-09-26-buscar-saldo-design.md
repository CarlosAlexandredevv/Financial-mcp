# Buscar saldo

## Contexto

O livro-caixa guarda lançamentos em `transactions`. Cada linha tem `owner_key`, `type` (`entrada` ou `saida`), `amount_cents` (sempre positivo), `occurred_on` e `description`. A tool `adicionar_transacao` grava uma linha do dono derivado de `MCP_ACCESS_SECRET`. Não existe leitura.

O saldo é a soma algébrica dessas linhas. Ele não é uma coluna e não precisa de tabela nova.

## Objetivo

A tool MCP `buscar_saldo` devolve o saldo do dono autenticado. A agregação acontece no PostgreSQL, via Drizzle. A resposta leva só o valor pedido.

## Fora de escopo

- Listar lançamentos.
- Saldo de um intervalo (`de` / `ate`) e totais separados de entrada e saída.
- Moeda, símbolo, separador de milhar ou página web.
- Migração, índice novo ou coluna de saldo.
- Alterar `formatAmount`, que continua formatando valores positivos de `adicionar_transacao`.

## Abordagens

1. **Saldo corrente, sem argumentos.** Uma soma de todo o histórico. Não responde "quanto eu tinha em tal dia" sem uma segunda tool.
2. **Saldo até uma data opcional.** A mesma soma, com `occurred_on <= ate` quando a data vem no pedido. Cobre o saldo de hoje e o saldo histórico.
3. **Movimento do período, com totais.** Exige dois limites e devolve entradas, saídas e saldo. É outra pergunta, maior que "buscar saldo".

A opção 2 fica. Um agregado, um filtro opcional, nenhuma linha de lançamento na resposta.

## Tool

Nome: `buscar_saldo`.

Descrição registrada no servidor:

`Informa o saldo do livro-caixa do dono autenticado. Sem ate, soma todo o histórico. Com ate em YYYY-MM-DD, soma os lançamentos ocorridos até essa data, inclusive.`

O servidor já recusou a chamada sem o segredo, em `src/app/mcp/route.ts`, antes de criar o `McpServer`. A tool recebe o `ownerKey` pelo closure de `createFinancialMcpServer`. Argumentos não escolhem dono.

`createFinancialMcpServer` aceita um segundo argumento opcional `{ loadBalance }` para teste. Em produção a rota continua chamando com um argumento, e a implementação usa `getBalance`.

## Entrada

```ts
{ ate?: unknown }
```

| Valor de `ate` | Efeito |
| --- | --- |
| `undefined` ou `""` | Soma todo o histórico daquele dono. |
| `YYYY-MM-DD` de um dia civil válido | Soma as linhas com `occurred_on` menor ou igual a essa data. Data futura é válida. |
| Qualquer outro valor, inclusive `null`, número, data com hora e texto com espaço | Erro `ate deve estar no formato YYYY-MM-DD e ser um dia válido.` Nenhuma query roda. |

A regra do dia civil é a mesma de `adicionar_transacao`: calendário gregoriano, sem ajuste de fuso. `2026-02-31` e `2026-9-01` são inválidos. O campo vazio não significa "hoje"; em `adicionar_transacao` a data vazia significa hoje, e aqui significa histórico inteiro.

O schema Zod declara só `ate`. Chaves extras, entre elas `ownerKey`, são descartadas pelo schema antes do handler. O handler também ignora qualquer coisa que não seja `ate`.

## Saída

Sucesso, histórico inteiro:

```json
{"saldo":"70.00"}
```

Sucesso com corte:

```json
{"saldo":"60.00","ate":"2026-01-02"}
```

`saldo` é string decimal com ponto e exatamente duas casas. Sem sinal quando o saldo é zero ou positivo. Com prefixo `-` quando é negativo. `-50` centavos aparecem como `"-0.50"`. Livro vazio, ou corte anterior a qualquer lançamento do dono, aparece como `"0.00"`.

`ate` só entra no JSON quando o corte foi aplicado. A ordem das chaves é `saldo`, depois `ate`.

Erro de entrada ou falha de leitura:

```json
{ "isError": true, "content": [{ "type": "text", "text": "<mensagem>" }] }
```

Mensagem de falha de banco, driver ou soma que não caiba em `bigint` do PostgreSQL: `Não foi possível consultar o saldo.` O texto da exceção, a URL do banco e o segredo não entram na resposta nem em log.

## Cálculo

Para o `owner_key` autenticado, e até `ate` quando ele existe:

```sql
coalesce(sum(case when "type" = 'entrada' then "amount_cents" else -"amount_cents" end), 0)::bigint
```

`sum` sem linhas devolve `null`; `coalesce` transforma isso em zero. O cast para `bigint` evita o `numeric` que o PostgreSQL usaria no `sum` de `bigint`. Estouro desse cast vira a mensagem genérica.

O `where` sempre contém `owner_key = <ownerKey do closure>`. Com corte, acrescenta `occurred_on <= <ate>`. O índice existente `transactions_owner_key_occurred_on_idx` cobre esse filtro.

A query não seleciona `id`, `description`, `type` nem qualquer outra coluna.

## Módulos

| Módulo | Responsabilidade |
| --- | --- |
| `src/balance/balance.ts` | Validar `ate`, formatar centavos com sinal, ler o valor cru do driver e montar a resposta da tool. Não importa banco. |
| `src/balance/balance-query.ts` | Montar o fragmento SQL da soma e o filtro por dono e data. Não abre conexão. |
| `src/balance/get-balance.ts` | Executar a query no `db`, com `server-only`, e devolver `{ saldoCents: bigint }`. |
| `src/mcp/server.ts` | Registrar `buscar_saldo` e passar o `ownerKey` já autenticado. |

`balance.ts` concentra o comportamento puro num arquivo sem imports locais. O `node:test` atual não resolve o alias `@/` nem imports relativos sem extensão, e os arquivos da aplicação não podem importar `.ts` explícito. Esse é o mesmo arranjo de `parse-transaction.ts`.

A checagem de dia civil fica repetida nesse arquivo. Os testes de `ate` cobrem dia inválido, para a regra não divergir em silêncio da tool de escrita.

## Testes

`npm test` continua sem PostgreSQL e passa a incluir `src/balance/balance.test.ts` e `src/balance/balance-query.test.ts`:

- formatação de zero, positivo, negativo e centavos abaixo de um real;
- `ate` ausente, vazio, válido e inválido;
- handler que não chama o banco quando `ate` é inválido;
- handler que usa o `ownerKey` recebido na função, mesmo que o argumento traga outro dono;
- handler que devolve o JSON mínimo e a mensagem genérica quando a leitura lança erro;
- SQL gerado pelo Drizzle com o dono no parâmetro, com o corte `<=` só quando `ate` existe, e sem selecionar descrição.

`npm run test:db` exige o PostgreSQL 17 do `docker-compose.yml` e `DATABASE_URL`. Esse script cobre dois arquivos:

- `src/balance/get-balance.test.ts` executa a query: donos diferentes não se misturam; o dia do corte entra na soma; um dia anterior a todos os lançamentos do dono devolve zero; saldo negativo devolve centavos negativos.
- `src/mcp/buscar-saldo.tool.test.ts` fala com `createFinancialMcpServer` por transporte em memória e um loader falso. Importar o servidor carrega o módulo do banco, que exige `DATABASE_URL`, e o loader falso não consulta o Postgres. O teste confere o nome da tool, o dono vindo do servidor e a resposta JSON.

## Critérios de aceite

- Chamada autenticada recebe só o saldo daquele `ownerKey`.
- Sem `ate`, a soma inclui todo o histórico desse dono.
- Com `ate` válido, a soma inclui as linhas desse dono até essa data, inclusive.
- `ate` inválido não consulta o banco.
- Livro vazio responde `{"saldo":"0.00"}`.
- A resposta de sucesso não contém lançamentos, segredo nem `DATABASE_URL`.
