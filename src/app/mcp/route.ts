import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { authorizeMcp } from "@/auth/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleMcp(request: Request): Promise<Response> {
  const decision = authorizeMcp({
    authorizationHeader: request.headers.get("authorization"),
    envSecret: process.env.MCP_ACCESS_SECRET,
    publicUrl: process.env.MCP_PUBLIC_URL,
    nowSeconds: Math.floor(Date.now() / 1000),
  });

  if (!decision.ok) {
    const headers: Record<string, string> = {
      "content-type": "text/plain; charset=utf-8",
    };
    if (decision.wwwAuthenticate !== undefined) {
      headers["WWW-Authenticate"] = decision.wwwAuthenticate;
    }
    return new Response(decision.message, {
      status: 401,
      headers,
    });
  }

  const { createFinancialMcpServer } = await import("@/mcp/server");
  const server = createFinancialMcpServer(decision.ownerKey);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const GET = handleMcp;
export const POST = handleMcp;
export const DELETE = handleMcp;
