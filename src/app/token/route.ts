import { createHash } from "node:crypto";

import { authorizeAccess } from "@/auth/access-secret";
import { decideToken } from "@/auth/oauth";
import {
  isFormContentType,
  oauthDisabledResponse,
  oauthErrorResponse,
  readIssuer,
} from "@/auth/oauth-http";
import { consumeOauthCode } from "@/auth/oauth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const issuer = readIssuer();
  if (issuer === null) return oauthDisabledResponse();

  if (!isFormContentType(request.headers.get("content-type"))) {
    return oauthErrorResponse("invalid_request");
  }

  const form = await request.formData();
  const grantType = form.get("grant_type")?.toString();

  if (grantType !== "authorization_code") {
    return oauthErrorResponse("unsupported_grant_type");
  }

  const code = form.get("code")?.toString();
  if (code === undefined) {
    return oauthErrorResponse("invalid_request");
  }

  const codeHash = createHash("sha256").update(code, "utf8").digest("hex");
  const consumed = await consumeOauthCode(codeHash, new Date());

  const envSecret = process.env.MCP_ACCESS_SECRET;
  const ownerDecision = authorizeAccess(
    envSecret === undefined ? null : `Bearer ${envSecret}`,
    envSecret,
  );
  if (!ownerDecision.ok) {
    return oauthErrorResponse("invalid_request");
  }

  const decision = decideToken({
    grantType,
    clientId: form.get("client_id")?.toString(),
    redirectUri: form.get("redirect_uri")?.toString(),
    codeVerifier: form.get("code_verifier")?.toString(),
    resource: form.get("resource")?.toString(),
    consumed,
    secret: envSecret ?? "",
    issuer,
    ownerKey: ownerDecision.ownerKey,
    nowSeconds: Math.floor(Date.now() / 1000),
  });

  if (!decision.ok) {
    return oauthErrorResponse(decision.error);
  }

  return Response.json({
    access_token: decision.access_token,
    token_type: decision.token_type,
    expires_in: decision.expires_in,
    scope: decision.scope,
  });
}
