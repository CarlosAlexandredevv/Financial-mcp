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

  return server;
}
