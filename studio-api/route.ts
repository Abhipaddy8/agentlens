// AgentLens Studio — /api/chat endpoint
// Next.js App Router: place at app/api/chat/route.ts
//
// M19: Streaming stub — proves end-to-end SSE pipeline
// M20: Wire in ConversationController here (see TODO below)

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
}

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle preflight
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: ChatRequest;

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(
      JSON.stringify({ error: "messages array is required and must not be empty" }),
      {
        status: 422,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  // -------------------------------------------------------------------
  // TODO [M20]: Replace stub response with ConversationController
  //
  //   import { ConversationController } from "@/lib/conversation-controller";
  //   const controller = new ConversationController();
  //   const stream = controller.run(body.messages);
  //   // stream is a ReadableStream of tokens — pipe it through below
  //
  // For now we stream a static placeholder token-by-token.
  // -------------------------------------------------------------------

  const PLACEHOLDER =
    "Hello! I'm AgentLens Studio. Tell me what agent you'd like to build, and I'll handle the rest.";

  const tokens = PLACEHOLDER.split(/(?<=\s)|(?=\s)/); // split preserving spaces

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      for (const token of tokens) {
        // Vercel AI SDK compatible SSE format:
        //   data: {"type":"text","value":"..."}
        const chunk = JSON.stringify({ type: "text", value: token });
        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));

        // Realistic token-by-token pacing (~30ms)
        await new Promise((r) => setTimeout(r, 30));
      }

      // Signal end of stream
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
