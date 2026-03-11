import { NextRequest } from "next/server";

/**
 * POST /api/chat
 *
 * Proxy to the AgentLens Studio API backend.
 * Accepts: { messages: [{ role, content }] }
 * Returns: SSE streaming response
 *
 * In M20 this will forward to the studio-api which routes through the AgentLens proxy.
 * For now, it echoes back a mock streaming response so the shell is testable standalone.
 */
export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const studioApiUrl = process.env.STUDIO_API_URL || "http://localhost:3001";

  // Try forwarding to studio-api backend
  try {
    const upstream = await fetch(`${studioApiUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    if (upstream.ok && upstream.body) {
      // Stream the response through
      return new Response(upstream.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }
  } catch {
    // Studio API not running — fall through to mock
  }

  // Mock streaming response for standalone testing
  const lastMessage = messages[messages.length - 1]?.content || "";
  const mockReply = `This is AgentLens Studio. Your message was: "${lastMessage}"\n\nThe studio-api backend is not connected yet. Connect it at ${studioApiUrl} to route through AgentLens proxy.`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Simulate token-by-token streaming using Vercel AI SDK format
      const words = mockReply.split(" ");
      for (let i = 0; i < words.length; i++) {
        const token = (i === 0 ? "" : " ") + words[i];
        // AI SDK data stream format: "0:" prefix for text tokens
        controller.enqueue(encoder.encode(`0:${JSON.stringify(token)}\n`));
        await new Promise((r) => setTimeout(r, 30));
      }
      // Finish message
      controller.enqueue(
        encoder.encode(
          `d:${JSON.stringify({ finishReason: "stop", usage: { promptTokens: 0, completionTokens: words.length } })}\n`
        )
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
