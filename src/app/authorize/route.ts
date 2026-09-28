import { createHash, randomBytes } from "node:crypto";

import { authorizeAccess } from "@/auth/access-secret";
import { decideAuthorize } from "@/auth/oauth";
import {
  oauthDisabledResponse,
  readIssuer,
  redirectWithOAuthParams,
} from "@/auth/oauth-http";
import { consentDocument, invalidRequestDocument } from "@/auth/consent-page";
import { findOauthClient, insertOauthCode } from "@/auth/oauth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    return new Response(invalidRequestDocument(), {
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
        consentDocument({
          host: decision.host,
          loopback: decision.loopback,
          params: decision.params,
          errorMessage: access.message,
        }),
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
    consentDocument({
      host: decision.host,
      loopback: decision.loopback,
      params: decision.params,
    }),
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
