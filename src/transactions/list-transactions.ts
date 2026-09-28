import { formatAmount } from "@/transactions/parse-transaction";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DE_MESSAGE = "de deve estar no formato YYYY-MM-DD e ser um dia válido.";
const ATE_MESSAGE = "ate deve estar no formato YYYY-MM-DD e ser um dia válido.";
const RANGE_MESSAGE = "de não pode ser posterior a ate.";
const TIPO_MESSAGE = "tipo deve ser entrada ou saida.";
const LIMITE_MESSAGE = "limite deve ser um inteiro de 1 a 50.";
const GENERIC_READ_ERROR = "Não foi possível listar os lançamentos.";
const DEFAULT_LIMITE = 50;
const MAX_LIMITE = 50;

export type TransactionsLoader = (query: {
  ownerKey: string;
  de?: string;
  ate?: string;
  tipo?: "entrada" | "saida";
  limite: number;
}) => Promise<{
  transacoes: Array<{
    id: string;
    tipo: "entrada" | "saida";
    amountCents: bigint;
    data: string;
    descricao: string;
  }>;
}>;

export type ListTransactionsToolResult = {
  isError?: true;
  content: [{ type: "text"; text: string }];
};

export type ListQueryInput = {
  de?: unknown;
  ate?: unknown;
  tipo?: unknown;
  limite?: unknown;
};

type ParsedListQuery = {
  de?: string;
  ate?: string;
  tipo?: "entrada" | "saida";
  limite: number;
  echo: { de?: string; ate?: string; tipo?: "entrada" | "saida" };
};

export function parseListQuery(
  input: ListQueryInput,
): { ok: true; query: ParsedListQuery } | { ok: false; message: string } {
  const echo: ParsedListQuery["echo"] = {};

  let de: string | undefined;
  if (input.de !== undefined && input.de !== "") {
    if (typeof input.de !== "string" || !isCivilDate(input.de)) {
      return { ok: false, message: DE_MESSAGE };
    }
    de = input.de;
    echo.de = input.de;
  }

  let ate: string | undefined;
  if (input.ate !== undefined && input.ate !== "") {
    if (typeof input.ate !== "string" || !isCivilDate(input.ate)) {
      return { ok: false, message: ATE_MESSAGE };
    }
    ate = input.ate;
    echo.ate = input.ate;
  }

  if (de !== undefined && ate !== undefined && de > ate) {
    return { ok: false, message: RANGE_MESSAGE };
  }

  let tipo: "entrada" | "saida" | undefined;
  if (input.tipo !== undefined && input.tipo !== "") {
    if (input.tipo !== "entrada" && input.tipo !== "saida") {
      return { ok: false, message: TIPO_MESSAGE };
    }
    tipo = input.tipo;
    echo.tipo = input.tipo;
  }

  const limite = parseLimite(input.limite);
  if (limite === null) {
    return { ok: false, message: LIMITE_MESSAGE };
  }

  return {
    ok: true,
    query: { de, ate, tipo, limite, echo },
  };
}

export async function listarTransacoes(input: {
  ownerKey: string;
  args: ListQueryInput;
  load: TransactionsLoader;
}): Promise<ListTransactionsToolResult> {
  const parsed = parseListQuery(input.args);
  if (!parsed.ok) {
    return { isError: true, content: [{ type: "text", text: parsed.message }] };
  }

  const { de, ate, tipo, limite, echo } = parsed.query;

  try {
    const { transacoes } = await input.load({
      ownerKey: input.ownerKey,
      de,
      ate,
      tipo,
      limite,
    });
    const body: {
      transacoes: Array<{
        id: string;
        tipo: "entrada" | "saida";
        valor: string;
        data: string;
        descricao: string;
      }>;
      limite: number;
      de?: string;
      ate?: string;
      tipo?: "entrada" | "saida";
    } = {
      transacoes: transacoes.map((row) => ({
        id: row.id,
        tipo: row.tipo,
        valor: formatAmount(row.amountCents),
        data: row.data,
        descricao: row.descricao,
      })),
      limite,
    };
    if (echo.de !== undefined) body.de = echo.de;
    if (echo.ate !== undefined) body.ate = echo.ate;
    if (echo.tipo !== undefined) body.tipo = echo.tipo;
    return { content: [{ type: "text", text: JSON.stringify(body) }] };
  } catch {
    return {
      isError: true,
      content: [{ type: "text", text: GENERIC_READ_ERROR }],
    };
  }
}

function parseLimite(limite: unknown): number | null {
  if (limite === undefined || limite === "") return DEFAULT_LIMITE;
  if (typeof limite === "number") {
    if (!Number.isInteger(limite) || limite < 1 || limite > MAX_LIMITE) return null;
    return limite;
  }
  if (typeof limite === "string" && /^\d+$/.test(limite)) {
    const value = Number(limite);
    if (value < 1 || value > MAX_LIMITE) return null;
    return value;
  }
  return null;
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
