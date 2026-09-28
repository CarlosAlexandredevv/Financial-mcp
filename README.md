# Financial MCP

Servidor de finanças pessoais exposto pelo [Model Context Protocol](https://modelcontextprotocol.io). Clientes como Claude, ChatGPT e Cursor consultam o saldo, listam lançamentos e registram entradas ou saídas. O modelo não acessa o PostgreSQL: quem lê e grava é este servidor, via Drizzle.

Há um único dono. O `MCP_ACCESS_SECRET` autentica as chamadas e identifica de quem são os dados. Argumentos das tools não escolhem o dono.

## Tools

| Tool | O que faz |
| --- | --- |
| `buscar_saldo` | Soma o histórico. Com `ate` (`YYYY-MM-DD`), soma até essa data, inclusive. |
| `listar_transacoes` | Até 50 lançamentos, do mais recente ao mais antigo. Filtros opcionais: `de`, `ate`, `tipo` (`entrada` ou `saida`) e `limite` (1–50). |
| `adicionar_transacao` | Registra uma entrada ou saída (`tipo`, `valor`, `descricao`, `data`). |

Filtro, ordenação e agregação acontecem no SQL. A resposta traz só o recorte pedido.

## Requisitos

- Node.js 20 ou superior
- Docker, para o PostgreSQL local

## Começar

```bash
cp .env.example .env.local
docker compose up -d
npm install
npm run db:migrate
npm run dev
```

O endpoint MCP fica em `http://localhost:3000/mcp`.

Troque `MCP_ACCESS_SECRET` no `.env.local` por um valor longo e aleatório antes de expor o servidor. Esse valor não entra no git.

## Variáveis

| Nome | Uso |
| --- | --- |
| `DATABASE_URL` | Conexão com o PostgreSQL. No Docker local: `postgresql://financial:financial@localhost:5432/financial`. |
| `MCP_ACCESS_SECRET` | Segredo do dono. Sem ele, nenhuma tool executa. |
| `MCP_PUBLIC_URL` | Origem pública, sem caminho e sem barra no fim (ex.: `https://financeiro.exemplo.com`). Sem ela, as rotas OAuth respondem 404. O `/mcp` continua aceitando o Bearer fixo. |

## Autenticação

O `Authorization: Bearer` em `/mcp` aceita duas credenciais:

- o próprio `MCP_ACCESS_SECRET`
- um access token JWT emitido por este servidor, quando `MCP_PUBLIC_URL` está definida

Para um cliente remoto que segue OAuth 2.1 (Claude, ChatGPT, Cursor), use a URL do recurso `MCP_PUBLIC_URL/mcp`. O servidor publica a descoberta, o registro dinâmico de cliente (`POST /register`), a autorização com PKCE (`GET /authorize`) e a troca do código (`POST /token`). A tela de consentimento pede o mesmo segredo. O escopo é `financial`. Não há refresh token nem várias contas.

## Banco

PostgreSQL 17 sobe com `docker compose up -d`. O schema está em `src/db/schema.ts`. Valores ficam em centavos.

```bash
npm run db:generate   # gera migração a partir do schema
npm run db:migrate    # aplica migrações
npm run db:push       # empurra o schema direto (desenvolvimento)
npm run db:studio     # Drizzle Studio
```

O `npm run build` aplica as migrações antes do build do Next.js.

## Scripts

```bash
npm run dev      # Next.js em desenvolvimento
npm test         # testes em src/**/*.test.ts
npm run lint
npm run build
npm start
```
