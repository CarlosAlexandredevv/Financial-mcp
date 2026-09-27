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
