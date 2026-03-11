import { NextRequest } from "next/server";
import { ConversationController } from "@/lib/controller";
import { ChatMessage } from "@/lib/types";

/**
 * POST /api/chat
 *
 * Conversation Controller endpoint for AgentLens Studio.
 *
 * Takes the full message history, runs it through the ConversationController
 * which tracks what brief fields have been collected, decides what to ask next,
 * and streams back a natural conversational response.
 *
 * Streams using Vercel AI SDK data stream format:
 *   0:"token"   — text tokens
 *   2:[...]     — metadata (controller state)
 *   d:{...}     — finish signal
 */
export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  // Validate messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({ error: "messages array is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    return fallbackMockResponse(messages);
  }

  try {
    const controller = new ConversationController(
      messages as ChatMessage[]
    );

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(streamController) {
        try {
          // Stream text tokens
          let tokenCount = 0;
          for await (const chunk of controller.generateResponse()) {
            tokenCount++;
            streamController.enqueue(
              encoder.encode(`0:${JSON.stringify(chunk)}\n`)
            );
          }

          // Send metadata as a custom data event
          const metadata = controller.getMetadata();
          streamController.enqueue(
            encoder.encode(
              `2:${JSON.stringify([{ type: "controller-metadata", ...metadata }])}\n`
            )
          );

          // If brief is complete, also send the compiled brief
          if (metadata.briefComplete) {
            const brief = controller.compileBrief();
            streamController.enqueue(
              encoder.encode(
                `2:${JSON.stringify([{ type: "compiled-brief", brief }])}\n`
              )
            );
          }

          // Finish signal
          streamController.enqueue(
            encoder.encode(
              `d:${JSON.stringify({
                finishReason: "stop",
                usage: { promptTokens: 0, completionTokens: tokenCount },
              })}\n`
            )
          );
          streamController.close();
        } catch (err) {
          // Stream an error message if something goes wrong mid-stream
          const errMsg =
            err instanceof Error ? err.message : "Unknown error";
          streamController.enqueue(
            encoder.encode(
              `0:${JSON.stringify(`\n\n[Error: ${errMsg}]`)}\n`
            )
          );
          streamController.enqueue(
            encoder.encode(
              `d:${JSON.stringify({ finishReason: "error", usage: { promptTokens: 0, completionTokens: 0 } })}\n`
            )
          );
          streamController.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * Fallback mock response when no OPENAI_API_KEY is configured.
 * Keeps the studio testable without credentials.
 */
function fallbackMockResponse(messages: ChatMessage[]) {
  const lastMessage = messages[messages.length - 1]?.content || "";
  const mockReply = `AgentLens Studio is running but no OPENAI_API_KEY is set.\n\nYour message: "${lastMessage}"\n\nAdd OPENAI_API_KEY to your .env.local file to enable the Conversation Controller.`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const words = mockReply.split(" ");
      for (let i = 0; i < words.length; i++) {
        const token = (i === 0 ? "" : " ") + words[i];
        controller.enqueue(encoder.encode(`0:${JSON.stringify(token)}\n`));
        await new Promise((r) => setTimeout(r, 30));
      }
      controller.enqueue(
        encoder.encode(
          `d:${JSON.stringify({
            finishReason: "stop",
            usage: { promptTokens: 0, completionTokens: words.length },
          })}\n`
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
