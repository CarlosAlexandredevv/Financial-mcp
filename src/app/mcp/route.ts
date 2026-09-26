import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { authorizeAccess } from "@/auth/access-secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleMcp(request: Request): Promise<Response> {
  const decision = authorizeAccess(
    request.headers.get("authorization"),
    process.env.MCP_ACCESS_SECRET,
  );

  if (!decision.ok) {
    return new Response(decision.message, {
      status: 401,
      headers: { "content-type": "text/plain; charset=utf-8" },
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
