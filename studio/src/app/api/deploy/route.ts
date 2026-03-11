import { NextRequest } from "next/server";
import { DeployPipeline, AgentConfig, CredentialMap } from "@/lib/deploy-pipeline";
import { DeployEvent } from "@/lib/types";
import { recordDeployment } from "@/lib/rollback-manager";

/**
 * POST /api/deploy
 *
 * Executes the deploy pipeline and streams progress events as SSE.
 *
 * Body: { sessionId: string, agentConfig: AgentConfig, credentials?: Record<string, string> }
 *
 * Streams events in Vercel AI SDK data format:
 *   2:[{type: "deploy-event", event: {...}}]  — progress/completion events
 *   0:"text"                                   — human-readable milestone text
 *   d:{finishReason: "stop", ...}             — stream end
 */
export async function POST(req: NextRequest) {
  let body: { sessionId?: string; agentConfig?: AgentConfig; credentials?: CredentialMap };

  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { sessionId, agentConfig, credentials } = body;

  if (!sessionId || !agentConfig) {
    return new Response(
      JSON.stringify({ error: "sessionId and agentConfig are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const pipeline = new DeployPipeline(agentConfig, credentials || {}, sessionId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(streamController) {
      try {
        let tokenCount = 0;

        for await (const event of pipeline.deploy()) {
          // Send every event on the data channel
          streamController.enqueue(
            encoder.encode(
              `2:${JSON.stringify([{ type: "deploy-event", event }])}\n`
            )
          );

          // Stream human-readable text for key events
          const text = deployEventToText(event);
          if (text) {
            tokenCount++;
            streamController.enqueue(
              encoder.encode(`0:${JSON.stringify(text)}\n`)
            );
          }

          // Record deployment on completion
          if (event.type === "deploy-complete" && event.agentId) {
            recordDeployment(
              event.agentId,
              agentConfig.version,
              `arn:aws:lambda:${process.env.AWS_REGION || "us-east-1"}:${process.env.AWS_ACCOUNT_ID || "123456789012"}:function:agentlens-${event.agentId}`
            );
          }
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
        const errMsg = err instanceof Error ? err.message : "Deploy stream error";
        streamController.enqueue(
          encoder.encode(
            `2:${JSON.stringify([{ type: "deploy-event", event: { type: "deploy-error", message: errMsg } }])}\n`
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
}

function deployEventToText(event: DeployEvent): string | null {
  if (event.type === "deploy-progress" && event.status === "complete") {
    return `  [${event.step}] ${event.message}\n`;
  }
  if (event.type === "deploy-progress" && event.status === "in-progress") {
    return `> ${event.message}...\n`;
  }
  if (event.type === "deploy-complete") {
    return `\n---\n\n**Deploy complete.**\n- Agent: \`${event.agentId}\`\n- Endpoint: \`${event.endpoint}\`\n- Dashboard: ${event.dashboardUrl}\n`;
  }
  if (event.type === "deploy-error") {
    return `\n[Deploy Error: ${event.message}]\n`;
  }
  return null;
}
