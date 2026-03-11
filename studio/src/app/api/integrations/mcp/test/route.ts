/**
 * POST /api/integrations/mcp/test
 *
 * Tests an MCP server URL by attempting to fetch its capabilities.
 * Body: { url, sessionId? }
 *
 * Returns the server's tools list or an error.
 */

import { NextRequest, NextResponse } from "next/server";
import { storeCredential } from "@/lib/credential-store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, sessionId } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "url is required" },
        { status: 400 }
      );
    }

    // Basic URL validation
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 422 }
      );
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        { error: "URL must use http or https protocol" },
        { status: 422 }
      );
    }

    // Attempt to reach the MCP server's capabilities / tools endpoint
    // MCP servers typically respond to a JSON-RPC request for tool listing
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        // Try a simple GET as fallback (some MCP servers expose a health endpoint)
        const healthResponse = await fetch(url, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        }).catch(() => null);

        if (healthResponse?.ok) {
          // Server is reachable but doesn't support JSON-RPC tools/list
          if (sessionId) {
            storeCredential(sessionId, "mcp", {
              type: "mcp_url",
              value: url,
              metadata: { status: "reachable", toolCount: "unknown" },
            });
          }

          return NextResponse.json({
            connected: true,
            url,
            reachable: true,
            tools: [],
            note: "Server is reachable but did not return a tools list. It may use a different protocol version.",
          });
        }

        return NextResponse.json(
          {
            connected: false,
            url,
            error: `Server returned ${response.status}: ${response.statusText}`,
          },
          { status: 502 }
        );
      }

      const data = await response.json();

      // Extract tools from JSON-RPC response
      const tools = data.result?.tools || data.tools || [];

      // Store the MCP URL if sessionId provided
      if (sessionId) {
        storeCredential(sessionId, "mcp", {
          type: "mcp_url",
          value: url,
          metadata: {
            status: "connected",
            toolCount: String(tools.length),
          },
        });
      }

      return NextResponse.json({
        connected: true,
        url,
        reachable: true,
        tools: tools.map((t: { name?: string; description?: string }) => ({
          name: t.name || "unknown",
          description: t.description || "",
        })),
        toolCount: tools.length,
      });
    } catch (fetchErr) {
      const message =
        fetchErr instanceof Error ? fetchErr.message : "Connection failed";

      if (message.includes("abort")) {
        return NextResponse.json(
          { connected: false, url, error: "Connection timed out (10s)" },
          { status: 504 }
        );
      }

      return NextResponse.json(
        { connected: false, url, error: message },
        { status: 502 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
