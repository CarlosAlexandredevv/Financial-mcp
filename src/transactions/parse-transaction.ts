const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_CENTS = 1_000_000_000_000n;
const RECONSTRUCTION_TOLERANCE = 1e-6;

const MESSAGES = {
  tipo: "tipo deve ser entrada ou saida.",
  valor: "valor deve ser positivo, finito e ter no máximo duas casas decimais.",
  data: "data deve estar no formato YYYY-MM-DD e ser um dia válido.",
  descricao: "descricao deve ter de 1 a 280 caracteres.",
} as const;

export type TransactionInput = {
  tipo?: unknown;
  valor?: unknown;
  descricao?: unknown;
  data?: unknown;
};

export type ParsedTransaction = {
  tipo: "entrada" | "saida";
  amountCents: bigint;
  data: string;
  descricao: string;
};

export type ParseResult =
  | { ok: true; transaction: ParsedTransaction }
  | { ok: false; message: string };

export function formatAmount(cents: bigint): string {
  const whole = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function parseTransaction(
  input: TransactionInput,
  now: Date = new Date(),
): ParseResult {
  if (input.tipo !== "entrada" && input.tipo !== "saida") {
    return { ok: false, message: MESSAGES.tipo };
  }

  const amountCents = parseAmount(input.valor);
  if (amountCents === null) {
    return { ok: false, message: MESSAGES.valor };
  }

  const data = parseDate(input.data, now);
  if (data === null) {
    return { ok: false, message: MESSAGES.data };
  }

  if (typeof input.descricao !== "string") {
    return { ok: false, message: MESSAGES.descricao };
  }
  const descricao = input.descricao.trim();
  if (descricao.length < 1 || descricao.length > 280) {
    return { ok: false, message: MESSAGES.descricao };
  }

  return {
    ok: true,
    transaction: { tipo: input.tipo, amountCents, data, descricao },
  };
}

function parseAmount(valor: unknown): bigint | null {
  if (typeof valor === "string") return parseAmountString(valor);
  if (typeof valor === "number") return parseAmountNumber(valor);
  return null;
}

function parseAmountString(valor: string): bigint | null {
  if (!AMOUNT_PATTERN.test(valor)) return null;
  const [whole, fraction = ""] = valor.split(".");
  if (whole.length > 1 && whole.startsWith("0")) return null;
  const cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  if (cents <= 0n || cents > MAX_CENTS) return null;
  return cents;
}

function parseDate(data: unknown, now: Date): string | null {
  if (data === undefined || data === "") return todayInSaoPaulo(now);
  if (typeof data !== "string" || !isCivilDate(data)) return null;
  return data;
}

function parseAmountNumber(valor: number): bigint | null {
  if (!Number.isFinite(valor) || valor <= 0) return null;
  const rounded = Math.round(valor * 100);
  if (!Number.isSafeInteger(rounded)) return null;
  if (Math.abs(rounded / 100 - valor) > RECONSTRUCTION_TOLERANCE) return null;
  if (rounded <= 0 || rounded > Number(MAX_CENTS)) return null;
  return BigInt(rounded);
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

function todayInSaoPaulo(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
