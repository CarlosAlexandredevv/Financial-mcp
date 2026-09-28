import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { BalanceLoader } from "@/balance/balance";
import { buscarSaldo } from "@/balance/balance";
import { getBalance } from "@/balance/get-balance";
import { addTransaction } from "@/transactions/add-transaction";
import { getTransactions } from "@/transactions/get-transactions";
import type { TransactionsLoader } from "@/transactions/list-transactions";
import { listarTransacoes } from "@/transactions/list-transactions";
import {
  formatAmount,
  parseTransaction,
} from "@/transactions/parse-transaction";

const GENERIC_WRITE_ERROR = "Não foi possível registrar o lançamento.";

export function createFinancialMcpServer(
  ownerKey: string,
  deps: { loadBalance?: BalanceLoader; loadTransactions?: TransactionsLoader } = {},
) {
  const loadBalance = deps.loadBalance ?? getBalance;
  const loadTransactions = deps.loadTransactions ?? getTransactions;
  const server = new McpServer(
    {
      name: "financial-mcp",
      title: "Finanças",
      version: "0.1.0",
    },
    {
      instructions:
        "Estes registros são as finanças pessoais do dono. Fale em finanças ao consultar o saldo, listar lançamentos e registrar entradas ou saídas.",
    },
  );

  server.registerTool(
    "adicionar_transacao",
    {
      description:
        "Registra um lançamento de entrada ou de saída nas finanças do dono autenticado.",
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
        "Informa o saldo das finanças do dono autenticado. Sem ate, soma todo o histórico. Com ate em YYYY-MM-DD, soma os lançamentos ocorridos até essa data, inclusive.",
      inputSchema: z.object({
        ate: z.unknown().optional(),
      }),
    },
    async (args) => buscarSaldo({ ownerKey, args, load: loadBalance }),
  );

  server.registerTool(
    "listar_transacoes",
    {
      description:
        "Lista lançamentos do dono autenticado, no máximo 50, da data mais recente para a mais antiga. Filtros opcionais: de e ate em YYYY-MM-DD (inclusive), tipo entrada ou saida, limite de 1 a 50 (padrão 50).",
      inputSchema: z.object({
        de: z.unknown().optional(),
        ate: z.unknown().optional(),
        tipo: z.unknown().optional(),
        limite: z.unknown().optional(),
      }),
    },
    async (args) =>
      listarTransacoes({ ownerKey, args, load: loadTransactions }),
  );

  return server;
}
