import { NextRequest } from "next/server";
import { ConversationController } from "@/lib/controller";
import { ChatMessage } from "@/lib/types";
import { compileBrief, parseBrief } from "@/lib/brief-compiler";
import { buildMissionMap } from "@/lib/mission-architect";
import { enrichMissionMap } from "@/lib/task-generator";

/**
 * POST /api/chat
 *
 * Conversation Controller endpoint for AgentLens Studio.
 *
 * Two modes:
 * 1. Normal chat: Takes message history, streams conversational response + metadata.
 * 2. Compile: When { action: "compile" } is sent, runs the full brief-to-mission pipeline:
 *    compileBrief → parseBrief → buildMissionMap → enrichMissionMap → stream result.
 *
 * Streams using Vercel AI SDK data stream format:
 *   0:"token"   — text tokens
 *   2:[...]     — metadata (controller state, mission map, pipeline phases)
 *   d:{...}     — finish signal
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { messages, action } = body;

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

  // --- COMPILE ACTION: Full brief-to-mission pipeline ---
  if (action === "compile") {
    return handleCompile(messages as ChatMessage[]);
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
 * Handle the compile action — full brief-to-mission pipeline.
 *
 * Streams progress phases so the frontend can show phase indicators:
 *   Phase 1: Compiling brief from conversation
 *   Phase 2: Parsing brief with LLM
 *   Phase 3: Building mission map
 *   Phase 4: Generating tasks for each mission
 *   Phase 5: Done — mission map ready
 */
async function handleCompile(messages: ChatMessage[]) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(streamController) {
      try {
        // Phase 1: Analyze conversation and compile brief
        streamController.enqueue(
          encoder.encode(
            `2:${JSON.stringify([{ type: "compile-phase", phase: "compiling", message: "Compiling brief from conversation..." }])}\n`
          )
        );

        const controller = new ConversationController(messages);
        await controller.analyzeConversation();
        const metadata = controller.getMetadata();
        const rawBrief = compileBrief(metadata.briefState);

        streamController.enqueue(
          encoder.encode(
            `2:${JSON.stringify([{ type: "raw-brief", brief: rawBrief }])}\n`
          )
        );

        // Phase 2: Parse brief with LLM
        streamController.enqueue(
          encoder.encode(
            `2:${JSON.stringify([{ type: "compile-phase", phase: "parsing", message: "Analyzing brief — detecting intent, stack, complexity..." }])}\n`
          )
        );

        const parsedBrief = await parseBrief(rawBrief);

        streamController.enqueue(
          encoder.encode(
            `2:${JSON.stringify([{ type: "parsed-brief", brief: parsedBrief }])}\n`
          )
        );

        // Phase 3: Build mission map (deterministic, instant)
        streamController.enqueue(
          encoder.encode(
            `2:${JSON.stringify([{ type: "compile-phase", phase: "architecting", message: `Building mission map for ${parsedBrief.projectName}...` }])}\n`
          )
        );

        const missionMap = buildMissionMap(parsedBrief);

        streamController.enqueue(
          encoder.encode(
            `2:${JSON.stringify([{ type: "mission-map-draft", missionMap }])}\n`
          )
        );

        // Phase 4: Enrich with tasks (parallel LLM calls)
        streamController.enqueue(
          encoder.encode(
            `2:${JSON.stringify([{ type: "compile-phase", phase: "generating-tasks", message: `Generating tasks for ${missionMap.totalMissions} missions...` }])}\n`
          )
        );

        const enrichedMap = await enrichMissionMap(missionMap, parsedBrief);

        // Phase 5: Done — send the full enriched mission map
        streamController.enqueue(
          encoder.encode(
            `2:${JSON.stringify([{ type: "compile-phase", phase: "complete", message: "Mission map ready." }])}\n`
          )
        );

        streamController.enqueue(
          encoder.encode(
            `2:${JSON.stringify([{ type: "mission-map", missionMap: enrichedMap, parsedBrief }])}\n`
          )
        );

        // Stream a human-readable summary as text tokens (line by line)
        const summary = formatMissionSummary(enrichedMap);
        const chunks = summary.split("\n");
        for (let i = 0; i < chunks.length; i++) {
          const chunk = i < chunks.length - 1 ? chunks[i] + "\n" : chunks[i];
          if (chunk) {
            streamController.enqueue(
              encoder.encode(`0:${JSON.stringify(chunk)}\n`)
            );
          }
        }

        // Finish
        streamController.enqueue(
          encoder.encode(
            `d:${JSON.stringify({ finishReason: "stop", usage: { promptTokens: 0, completionTokens: summary.length } })}\n`
          )
        );
        streamController.close();
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        streamController.enqueue(
          encoder.encode(
            `2:${JSON.stringify([{ type: "compile-phase", phase: "error", message: errMsg }])}\n`
          )
        );
        streamController.enqueue(
          encoder.encode(
            `0:${JSON.stringify(`\n\n[Compilation Error: ${errMsg}]`)}\n`
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

/**
 * Format the enriched mission map as a readable summary for the chat stream.
 */
function formatMissionSummary(missionMap: import("@/lib/mission-architect").MissionMap): string {
  const lines: string[] = [];

  lines.push(`**${missionMap.projectName}** — ${missionMap.totalMissions} missions, ${missionMap.complexity} complexity\n\n`);

  for (const mission of missionMap.missions) {
    lines.push(`### Mission ${mission.id}: ${mission.name}\n`);
    lines.push(`**Pipeline:** ${mission.pipelineBlocks.map((b) => `[${b}]`).join(" → ")}\n\n`);

    if (mission.tasks.length > 0) {
      for (const task of mission.tasks) {
        lines.push(`- ${task}\n`);
      }
      lines.push("\n");
    }
  }

  lines.push("---\n\nReady to build? Confirm and I'll start executing.");
  return lines.join("");
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
