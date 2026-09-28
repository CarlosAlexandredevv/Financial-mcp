import { validateClientMetadata } from "@/auth/oauth";
import {
  isJsonContentType,
  oauthDisabledResponse,
  oauthErrorResponse,
  readIssuer,
} from "@/auth/oauth-http";
import { insertOauthClient } from "@/auth/oauth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (readIssuer() === null) return oauthDisabledResponse();
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return oauthErrorResponse("invalid_client_metadata");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return oauthErrorResponse("invalid_client_metadata");
  }

  const validated = validateClientMetadata(body);
  if (!validated.ok) {
    return oauthErrorResponse(validated.error);
  }

  const { clientId } = await insertOauthClient(validated.redirectUris);
  return Response.json(
    {
      client_id: clientId,
      redirect_uris: validated.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    },
    { status: 201 },
  );
}
