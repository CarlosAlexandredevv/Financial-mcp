import { createHash, randomBytes } from "node:crypto";

import { authorizeAccess } from "@/auth/access-secret";
import { decideAuthorize, type AuthorizeParams } from "@/auth/oauth";
import {
  escapeHtml,
  oauthDisabledResponse,
  readIssuer,
  redirectWithOAuthParams,
} from "@/auth/oauth-http";
import { findOauthClient, insertOauthCode } from "@/auth/oauth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HTML_400 = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Solicitação inválida</title></head><body><p>Solicitação inválida.</p></body></html>`;

function readQueryParams(
  searchParams: URLSearchParams,
): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    query[key] = value;
  }
  return query;
}

function readFormParams(form: FormData): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") query[key] = value;
  }
  return query;
}

function consentHtml(
  host: string,
  loopback: boolean,
  params: AuthorizeParams,
  errorMessage?: string,
): string {
  const hidden = [
    ["response_type", params.responseType],
    ["client_id", params.clientId],
    ["redirect_uri", params.redirectUri],
    ["code_challenge", params.codeChallenge],
    ["code_challenge_method", params.codeChallengeMethod],
    ["resource", params.resource],
    ["scope", params.scope],
    ...(params.state === undefined ? [] : [["state", params.state]]),
  ]
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
    )
    .join("");

  const warning = loopback
    ? "<p>Qualquer processo local pode ocupar esta porta.</p>"
    : "";
  const error = errorMessage === undefined
    ? ""
    : `<p>${escapeHtml(errorMessage)}</p>`;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Autorizar acesso</title></head><body>
<h1>Autorizar acesso</h1>
<p>O aplicativo em <strong>${escapeHtml(host)}</strong> pede acesso às suas finanças.</p>
${warning}
${error}
<form method="post">
${hidden}
<label for="secret">Segredo de acesso</label>
<input id="secret" name="secret" type="password" autocomplete="current-password" required>
<button type="submit">Autorizar</button>
</form>
</body></html>`;
}

async function handleAuthorize(
  query: Record<string, string>,
  secret?: string,
): Promise<Response> {
  const issuer = readIssuer();
  if (issuer === null) return oauthDisabledResponse();

  const clientId = query.client_id;
  const client =
    clientId === undefined ? null : await findOauthClient(clientId);

  const decision = decideAuthorize({
    query,
    issuer,
    registeredRedirectUris: client?.redirectUris ?? null,
  });

  if (decision.kind === "html-400") {
    return new Response(HTML_400, {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (decision.kind === "redirect-error") {
    return redirectWithOAuthParams(decision.redirectUri, {
      error: decision.error,
      state: decision.state,
      iss: decision.iss,
    });
  }

  if (secret !== undefined) {
    const access = authorizeAccess(
      secret.length === 0 ? null : `Bearer ${secret}`,
      process.env.MCP_ACCESS_SECRET,
    );
    if (!access.ok) {
      return new Response(
        consentHtml(decision.host, decision.loopback, decision.params, access.message),
        {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      );
    }

    const plainCode = randomBytes(32).toString("base64url");
    const codeHash = createHash("sha256").update(plainCode, "utf8").digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await insertOauthCode({
      codeHash,
      clientId: decision.params.clientId,
      redirectUri: decision.params.redirectUri,
      codeChallenge: decision.params.codeChallenge,
      resource: decision.params.resource,
      expiresAt,
    });

    return redirectWithOAuthParams(decision.params.redirectUri, {
      code: plainCode,
      state: decision.params.state,
      iss: issuer,
    });
  }

  return new Response(
    consentHtml(decision.host, decision.loopback, decision.params),
    {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    },
  );
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return handleAuthorize(readQueryParams(url.searchParams));
}

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const params = readFormParams(form);
  const secret = form.get("secret")?.toString();
  return handleAuthorize(params, secret);
}
