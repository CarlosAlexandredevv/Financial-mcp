import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

const UNAUTHORIZED_MESSAGE = "Não autorizado.";

export type AccessResult =
  | { ok: true; ownerKey: string }
  | { ok: false; message: string };

export function authorizeAccess(
  authorizationHeader: string | null,
  envSecret: string | undefined,
): AccessResult {
  const presented = readBearerToken(authorizationHeader);
  if (presented === null || envSecret === undefined || envSecret.length === 0) {
    return { ok: false, message: UNAUTHORIZED_MESSAGE };
  }

  const presentedDigest = sha256(presented);
  const envDigest = sha256(envSecret);
  if (!timingSafeEqual(presentedDigest, envDigest)) {
    return { ok: false, message: UNAUTHORIZED_MESSAGE };
  }

  return { ok: true, ownerKey: envDigest.toString("hex") };
}

function readBearerToken(header: string | null): string | null {
  if (header === null || header.length < "Bearer ".length) return null;
  if (header.slice(0, 7).toLowerCase() !== "bearer ") return null;
  const token = header.slice(7);
  if (token.length === 0 || /\s/.test(token)) return null;
  return token;
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}
