import { authorizationServerMetadata } from "@/auth/oauth";
import { oauthDisabledResponse, readIssuer } from "@/auth/oauth-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  const issuer = readIssuer();
  if (issuer === null) return oauthDisabledResponse();
  return Response.json(authorizationServerMetadata(issuer));
}
