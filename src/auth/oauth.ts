import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import { authorizeAccess } from "./access-secret";

const UNAUTHORIZED_MESSAGE = "Não autorizado.";
const ACCESS_TOKEN_TTL_SECONDS = 2_592_000;
const FINANCIAL_SCOPE = "financial";

export type AuthorizeParams = {
  responseType: "code";
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  resource: string;
  scope: "financial";
  state?: string;
};

export function normalizePublicUrl(raw: string | undefined): string | null {
  if (raw === undefined || raw.length === 0) return null;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function mcpResourceUrl(issuer: string): string {
  return `${issuer}/mcp`;
}

export function protectedResourceMetadata(issuer: string) {
  return {
    resource: mcpResourceUrl(issuer),
    authorization_servers: [issuer],
    scopes_supported: [FINANCIAL_SCOPE] as ["financial"],
    bearer_methods_supported: ["header"] as ["header"],
  };
}

export function authorizationServerMetadata(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
    response_types_supported: ["code"] as ["code"],
    grant_types_supported: ["authorization_code"] as ["authorization_code"],
    code_challenge_methods_supported: ["S256"] as ["S256"],
    token_endpoint_auth_methods_supported: ["none"] as ["none"],
    scopes_supported: [FINANCIAL_SCOPE] as ["financial"],
  };
}

export function validateClientMetadata(
  body: unknown,
):
  | { ok: true; redirectUris: string[] }
  | { ok: false; error: "invalid_client_metadata" } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "invalid_client_metadata" };
  }
  const record = body as Record<string, unknown>;

  if ("client_secret" in record && record.client_secret !== undefined) {
    return { ok: false, error: "invalid_client_metadata" };
  }

  const authMethod = record.token_endpoint_auth_method;
  if (authMethod !== undefined && authMethod !== "none") {
    return { ok: false, error: "invalid_client_metadata" };
  }

  const grantTypes = record.grant_types;
  if (grantTypes !== undefined) {
    if (!Array.isArray(grantTypes) || grantTypes.length === 0) {
      return { ok: false, error: "invalid_client_metadata" };
    }
    const allowed = grantTypes.every(
      (grant) => grant === "authorization_code" || grant === "refresh_token",
    );
    if (!allowed || !grantTypes.includes("authorization_code")) {
      return { ok: false, error: "invalid_client_metadata" };
    }
  }

  const responseTypes = record.response_types;
  if (
    responseTypes !== undefined &&
    (!Array.isArray(responseTypes) ||
      responseTypes.length !== 1 ||
      responseTypes[0] !== "code")
  ) {
    return { ok: false, error: "invalid_client_metadata" };
  }

  const redirectUris = record.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return { ok: false, error: "invalid_client_metadata" };
  }

  const parsed: string[] = [];
  for (const uri of redirectUris) {
    if (typeof uri !== "string" || !isAllowedRedirectUri(uri)) {
      return { ok: false, error: "invalid_client_metadata" };
    }
    parsed.push(uri);
  }

  return { ok: true, redirectUris: parsed };
}

function isAllowedRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash.length > 0) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") {
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  }
  return false;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function redirectKey(uri: string): string | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return null;
  }
  const port =
    url.protocol === "http:" && isLoopbackHost(url.hostname) ? "" : url.port;
  return `${url.protocol}//${url.hostname}${port ? `:${port}` : ""}${url.pathname}${url.search}`;
}

export function redirectMatches(registered: string, presented: string): boolean {
  const a = redirectKey(registered);
  const b = redirectKey(presented);
  if (a === null || b === null) return false;
  return a === b;
}

export function verifyPkce(verifier: string, challenge: string): boolean {
  const computed = createHash("sha256").update(verifier).digest("base64url");
  if (computed.length !== challenge.length) return false;
  return timingSafeEqual(
    Buffer.from(computed, "utf8"),
    Buffer.from(challenge, "utf8"),
  );
}

function jwtSigningKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeBase64UrlJson<T>(segment: string): T | null {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function signAccessToken(input: {
  secret: string;
  issuer: string;
  audience: string;
  ownerKey: string;
  nowSeconds: number;
}): string {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: input.issuer,
    aud: input.audience,
    sub: input.ownerKey,
    scope: FINANCIAL_SCOPE,
    iat: input.nowSeconds,
    exp: input.nowSeconds + ACCESS_TOKEN_TTL_SECONDS,
  };
  const encodedHeader = base64UrlJson(header);
  const encodedPayload = base64UrlJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", jwtSigningKey(input.secret))
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

export function verifyAccessToken(
  token: string,
  input: {
    secret: string;
    issuer: string;
    audience: string;
    nowSeconds: number;
  },
): { ok: true; ownerKey: string } | { ok: false } {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false };

  const header = decodeBase64UrlJson<{ alg?: string }>(parts[0]!);
  if (header?.alg !== "HS256") return { ok: false };

  const signingInput = `${parts[0]}.${parts[1]}`;
  const expectedSig = createHmac("sha256", jwtSigningKey(input.secret))
    .update(signingInput)
    .digest("base64url");
  const actualSig = parts[2]!;
  if (expectedSig.length !== actualSig.length) return { ok: false };
  if (
    !timingSafeEqual(
      Buffer.from(expectedSig, "utf8"),
      Buffer.from(actualSig, "utf8"),
    )
  ) {
    return { ok: false };
  }

  const payload = decodeBase64UrlJson<{
    iss?: string;
    aud?: string;
    sub?: string;
    scope?: string;
    exp?: number;
  }>(parts[1]!);
  if (payload === null) return { ok: false };
  if (payload.iss !== input.issuer) return { ok: false };
  if (payload.aud !== input.audience) return { ok: false };
  if (payload.scope !== FINANCIAL_SCOPE) return { ok: false };
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    return { ok: false };
  }
  if (typeof payload.exp !== "number" || payload.exp <= input.nowSeconds) {
    return { ok: false };
  }

  return { ok: true, ownerKey: payload.sub };
}

export function wwwAuthenticateHeader(issuer: string): string {
  return `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource/mcp", scope="financial"`;
}

export function authorizeMcp(input: {
  authorizationHeader: string | null;
  envSecret: string | undefined;
  publicUrl: string | undefined;
  nowSeconds: number;
}):
  | { ok: true; ownerKey: string }
  | { ok: false; message: "Não autorizado."; wwwAuthenticate?: string } {
  const secretDecision = authorizeAccess(
    input.authorizationHeader,
    input.envSecret,
  );
  if (secretDecision.ok) {
    return secretDecision;
  }

  const issuer = normalizePublicUrl(input.publicUrl);
  if (
    issuer !== null &&
    input.envSecret !== undefined &&
    input.envSecret.length > 0 &&
    input.authorizationHeader !== null
  ) {
    const bearer = readBearerToken(input.authorizationHeader);
    if (bearer !== null) {
      const jwtDecision = verifyAccessToken(bearer, {
        secret: input.envSecret,
        issuer,
        audience: mcpResourceUrl(issuer),
        nowSeconds: input.nowSeconds,
      });
      if (jwtDecision.ok) {
        return { ok: true, ownerKey: jwtDecision.ownerKey };
      }
    }
  }

  const failure: {
    ok: false;
    message: "Não autorizado.";
    wwwAuthenticate?: string;
  } = { ok: false, message: UNAUTHORIZED_MESSAGE };
  if (issuer !== null) {
    failure.wwwAuthenticate = wwwAuthenticateHeader(issuer);
  }
  return failure;
}

function readBearerToken(header: string | null): string | null {
  if (header === null || header.length < "Bearer ".length) return null;
  if (header.slice(0, 7).toLowerCase() !== "bearer ") return null;
  const token = header.slice(7);
  if (token.length === 0 || /\s/.test(token)) return null;
  return token;
}

export function decideAuthorize(input: {
  query: Record<string, string>;
  issuer: string;
  registeredRedirectUris: string[] | null;
}):
  | { kind: "html-400" }
  | {
      kind: "redirect-error";
      redirectUri: string;
      error: string;
      state?: string;
      iss: string;
    }
  | {
      kind: "consent";
      host: string;
      loopback: boolean;
      params: AuthorizeParams;
    } {
  const {
    response_type: responseType,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    resource,
    state,
    scope,
  } = input.query;

  if (
    input.registeredRedirectUris === null ||
    clientId === undefined ||
    redirectUri === undefined ||
    !input.registeredRedirectUris.some((registered) =>
      redirectMatches(registered, redirectUri),
    )
  ) {
    return { kind: "html-400" };
  }

  const redirectError = (
    error: string,
  ): {
    kind: "redirect-error";
    redirectUri: string;
    error: string;
    state?: string;
    iss: string;
  } => ({
    kind: "redirect-error",
    redirectUri,
    error,
    state,
    iss: input.issuer,
  });

  if (responseType !== "code") {
    return redirectError("unsupported_response_type");
  }
  if (scope !== undefined && scope !== FINANCIAL_SCOPE) {
    return redirectError("invalid_scope");
  }
  if (resource !== mcpResourceUrl(input.issuer)) {
    return redirectError("invalid_target");
  }
  if (
    codeChallenge === undefined ||
    codeChallengeMethod !== "S256" ||
    clientId.length === 0
  ) {
    return redirectError("invalid_request");
  }

  let host = "";
  let loopback = false;
  try {
    const url = new URL(redirectUri);
    host = url.host;
    loopback = isLoopbackHost(url.hostname);
  } catch {
    return redirectError("invalid_request");
  }

  return {
    kind: "consent",
    host,
    loopback,
    params: {
      responseType: "code",
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod: "S256",
      resource,
      scope: FINANCIAL_SCOPE,
      state,
    },
  };
}

export function decideToken(input: {
  grantType: string | undefined;
  clientId: string | undefined;
  redirectUri: string | undefined;
  codeVerifier: string | undefined;
  resource: string | undefined;
  consumed: null | {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    resource: string;
  };
  secret: string;
  issuer: string;
  ownerKey: string;
  nowSeconds: number;
}):
  | {
      ok: false;
      error:
        | "invalid_request"
        | "invalid_grant"
        | "unsupported_grant_type"
        | "invalid_scope";
    }
  | {
      ok: true;
      access_token: string;
      token_type: "Bearer";
      expires_in: 2592000;
      scope: "financial";
    } {
  if (input.grantType !== "authorization_code") {
    return { ok: false, error: "unsupported_grant_type" };
  }

  const {
    clientId,
    redirectUri,
    codeVerifier,
    resource,
    consumed,
    secret,
    issuer,
    ownerKey,
    nowSeconds,
  } = input;

  if (
    clientId === undefined ||
    redirectUri === undefined ||
    codeVerifier === undefined ||
    resource === undefined
  ) {
    return { ok: false, error: "invalid_request" };
  }

  if (consumed === null) {
    return { ok: false, error: "invalid_grant" };
  }

  if (
    consumed.clientId !== clientId ||
    consumed.redirectUri !== redirectUri ||
    consumed.resource !== resource ||
    !verifyPkce(codeVerifier, consumed.codeChallenge)
  ) {
    return { ok: false, error: "invalid_grant" };
  }

  const audience = mcpResourceUrl(issuer);
  const access_token = signAccessToken({
    secret,
    issuer,
    audience,
    ownerKey,
    nowSeconds,
  });

  return {
    ok: true,
    access_token,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: FINANCIAL_SCOPE,
  };
}
