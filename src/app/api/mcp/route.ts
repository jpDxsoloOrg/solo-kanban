import type { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticate } from "@/lib/api/auth";
import { createMcpServer } from "@/lib/mcp/server";

/**
 * MCP endpoint (Streamable HTTP, stateless) for Claude and other MCP
 * clients. Uses the same API keys as /api/v1:
 *
 *   claude mcp add --transport http solo-kanban https://<host>/api/mcp \
 *     --header "Authorization: Bearer <API key>"
 */
export const dynamic = "force-dynamic";

function unauthorized(status: number, code: string, message: string) {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message: `${code}: ${message}` }, id: null },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(status === 401 && { "WWW-Authenticate": 'Bearer realm="solo-kanban"' }),
      },
    },
  );
}

async function handle(req: NextRequest): Promise<Response> {
  const auth = authenticate(req);
  if (!auth.ok) return unauthorized(auth.status, auth.code, auth.message);

  const authHeaders: Record<string, string> = {};
  for (const name of ["authorization", "x-api-key"]) {
    const value = req.headers.get(name);
    if (value) authHeaders[name] = value;
  }

  // Stateless: a fresh server and transport per request, JSON responses
  // (no long-lived streams, which serverless hosting cuts off).
  const server = createMcpServer({ origin: req.nextUrl.origin, authHeaders });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await server.close();
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
