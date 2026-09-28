# AGENTS.md

## Intuito

Financial MCP é um servidor de finanças pessoais exposto pelo Model Context Protocol (MCP). Clientes como Claude, GPT e outros modelos compatíveis com MCP consultam e registram o livro-caixa por tools, sem acesso direto ao banco.

A superfície (app Next.js e endpoint MCP) só recebe pedidos. A fonte de verdade é o PostgreSQL. Quem lê e grava é o servidor, via Drizzle.

## Stack

- Next.js (App Router) para a aplicação e o transporte MCP
- PostgreSQL 17, subido com Docker Compose
- Drizzle ORM (`src/db/schema.ts`). Quem consulta e grava passa por `src/db.ts`; o cliente fica em `src/db/client.ts`
- Segredos em `.env.local`. O modelo público fica em `.env.example`

Scripts de banco: `db:generate`, `db:migrate`, `db:push`, `db:studio`.

## Busca no servidor

Toda busca, filtro, ordenação, agregação e paginação acontece no servidor, em SQL, via Drizzle. Módulos que tocam o banco importam `server-only`.

O cliente (browser ou modelo) manda critérios. O servidor monta a query, restringe ao dono autenticado e devolve só o recorte pedido. O modelo não recebe a tabela inteira para filtrar no prompt.

`DATABASE_URL` permanece no processo do servidor. Nunca volta em resposta de página, tool ou log.

## Proteção

Conhecer a URL, o código ou o schema das tools não autoriza leitura nem escrita. Sem o segredo do ambiente, nenhuma tool financeira executa.

- `DATABASE_URL` liga o servidor ao PostgreSQL. Não sai do servidor e não entra no git.
- `MCP_ACCESS_SECRET` é o segredo que o cliente MCP apresenta no transporte (header ou mecanismo de auth do MCP), lido só no servidor. Sem correspondência, a chamada é recusada antes de qualquer query. O mesmo valor identifica o dono na tela de consentimento OAuth.
- O Bearer do `/mcp` pode ser esse segredo ou o access token JWT emitido por este servidor (fluxo OAuth com `MCP_PUBLIC_URL` configurada).
- O segredo identifica o dono dos dados. O servidor deriva o escopo a partir dele. Argumentos da tool não escolhem o dono e não podem ampliar o escopo.
- Uma chamada autenticada enxerga e altera apenas as linhas daquele dono. Não existe operação que liste ou mova finanças de outra pessoa.
- A comparação do segredo é em tempo constante. O valor não aparece em log, mensagem de erro nem resultado de tool.
- `.env`, `.env.local` e qualquer chave real ficam fora do git. `.env.example` só documenta nomes e placeholders.

Ao adicionar uma tool, o portão do segredo e o filtro por dono vêm antes da query.

## Convenções

- Tabelas novas entram em `src/db/schema.ts`. Gere a migração com Drizzle Kit; não altere o banco à mão.
- Código que importa `db` fica em módulo de servidor.
- Respostas ao modelo trazem o mínimo necessário para a pergunta, não dumps de lançamentos.
