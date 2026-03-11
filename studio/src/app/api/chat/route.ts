import { NextRequest } from "next/server";
import { ConversationController } from "@/lib/controller";
import { ChatMessage, DeployEvent, ShadowTestEvent } from "@/lib/types";
import { compileBrief, parseBrief } from "@/lib/brief-compiler";
import { buildMissionMap, MissionMap } from "@/lib/mission-architect";
import { enrichMissionMap } from "@/lib/task-generator";
import { BuildRunner, BuildEvent } from "@/lib/build-runner";
import { detectIntegrations } from "@/lib/integration-detector";
import { DeployPipeline, AgentConfig, CredentialMap } from "@/lib/deploy-pipeline";
import { shadowTest, generateDefaultTestCases } from "@/lib/shadow-tester";
import { evaluateQuality, formatQualityReport } from "@/lib/quality-evaluator";
import { recordDeployment, rollback as rollbackAgent, getActiveVersion, getPreviousVersion } from "@/lib/rollback-manager";
import { getActivityFeed } from "@/lib/activity-feed";
import { getMemories, getRecentLearnings } from "@/lib/memory-manager";
import { getRoutingDecisions, getRoutingStats } from "@/lib/routing-tracker";
import { listApprovals, getApprovalHistory, createApprovalRequest } from "@/lib/approval-manager";
import { getAutonomyConfig } from "@/lib/autonomy-config";

/**
 * POST /api/chat
 *
 * Conversation Controller endpoint for AgentLens Studio.
 *
 * Three modes:
 * 1. Normal chat: Takes message history, streams conversational response + metadata.
 * 2. Compile: When { action: "compile" } is sent, runs the full brief-to-mission pipeline:
 *    compileBrief → parseBrief → buildMissionMap → enrichMissionMap → stream result.
 * 3. Build: When { action: "build", missionMap: {...} } is sent, simulates mission execution
 *    streaming progress events as SSE data so the frontend can render build progress + games.
 *
 * Streams using Vercel AI SDK data stream format:
 *   0:"token"   — text tokens
 *   2:[...]     — metadata (controller state, mission map, pipeline phases, build events)
 *   d:{...}     — finish signal
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { messages, action, missionMap, agentConfig, credentials, sessionId: reqSessionId, previousConfig } = body;

  // --- DEPLOY ACTION: Run deploy pipeline (with optional shadow test for updates) ---
  if (action === "deploy") {
    if (!agentConfig) {
      return new Response(
        JSON.stringify({ error: "agentConfig is required for deploy action" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    return handleDeploy(
      agentConfig as AgentConfig,
      (credentials || {}) as CredentialMap,
      reqSessionId || "default",
      previousConfig as AgentConfig | undefined
    );
  }

  // --- BUILD ACTION: Simulate mission execution with progress events ---
  if (action === "build") {
    if (!missionMap) {
      return new Response(
        JSON.stringify({ error: "missionMap is required for build action" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    return handleBuild(missionMap as MissionMap);
  }

  // Validate messages (required for chat and compile actions)
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

          // Detect integrations mentioned in conversation
          const sessionId = (messages as ChatMessage[])[0]?.content?.slice(0, 16) || "default";
          const detected = detectIntegrations(messages as ChatMessage[], sessionId);
          if (detected.length > 0) {
            streamController.enqueue(
              encoder.encode(
                `2:${JSON.stringify(detected.map((d) => ({ type: "integration-prompt", ...d })))}\n`
              )
            );
          }

          // Detect memory/routing queries from latest user message
          const lastUserMsg = (messages as ChatMessage[])
            .filter((m: ChatMessage) => m.role === "user")
            .pop()?.content?.toLowerCase() || "";

          const memoryKeywords = ["what does it remember", "show memories", "what has it learned", "agent memory", "what it knows"];
          const routingKeywords = ["how does it decide", "show routing", "routing decisions", "query routing", "how does it route"];

          if (memoryKeywords.some((kw) => lastUserMsg.includes(kw))) {
            try {
              // Use a default agent ID — in production this comes from the active agent context
              const agentId = "opera-crm-monitor";
              const [memories, learnings] = await Promise.all([
                getMemories(agentId),
                getRecentLearnings(agentId, 5),
              ]);
              streamController.enqueue(
                encoder.encode(
                  `2:${JSON.stringify([{ type: "memory-display", memories, learnings }])}\n`
                )
              );
            } catch {
              // Non-critical
            }
          }

          if (routingKeywords.some((kw) => lastUserMsg.includes(kw))) {
            try {
              const agentId = "opera-crm-monitor";
              const [decisions, stats] = await Promise.all([
                getRoutingDecisions(agentId, 10),
                getRoutingStats(agentId),
              ]);
              streamController.enqueue(
                encoder.encode(
                  `2:${JSON.stringify([{ type: "routing-viz", decisions, stats }])}\n`
                )
              );
            } catch {
              // Non-critical
            }
          }

          // Detect approval/autonomy queries
          const approvalKeywords = ["what needs my approval", "pending approvals", "show approvals", "approval requests", "waiting for approval"];
          const approvalHistoryKeywords = ["approval history", "show approval history", "past approvals", "approval log"];
          const autonomyKeywords = ["configure approvals", "approval settings", "autonomy settings", "trust level", "autonomy config"];

          if (approvalKeywords.some((kw) => lastUserMsg.includes(kw))) {
            try {
              const agentId = "opera-crm-monitor";
              const pending = await listApprovals(agentId, "waiting");
              const all = await listApprovals(agentId);
              streamController.enqueue(
                encoder.encode(
                  `2:${JSON.stringify([{ type: "approval-list", pending, all }])}\n`
                )
              );
            } catch {
              // Non-critical
            }
          }

          if (approvalHistoryKeywords.some((kw) => lastUserMsg.includes(kw))) {
            try {
              const agentId = "opera-crm-monitor";
              const history = await getApprovalHistory(agentId);
              streamController.enqueue(
                encoder.encode(
                  `2:${JSON.stringify([{ type: "approval-history", history }])}\n`
                )
              );
            } catch {
              // Non-critical
            }
          }

          if (autonomyKeywords.some((kw) => lastUserMsg.includes(kw))) {
            try {
              const agentId = "opera-crm-monitor";
              const config = await getAutonomyConfig(agentId);
              streamController.enqueue(
                encoder.encode(
                  `2:${JSON.stringify([{ type: "autonomy-config", config }])}\n`
                )
              );
            } catch {
              // Non-critical
            }
          }

          // Simulate agent hitting a decision point — emit approval request for demo
          const decisionPointKeywords = ["run the agent", "execute now", "start the agent", "trigger the agent"];
          if (decisionPointKeywords.some((kw) => lastUserMsg.includes(kw))) {
            try {
              const agentId = "opera-crm-monitor";
              const request = await createApprovalRequest(
                agentId,
                "Send follow-up sequence to 23 contacts who opened but didn't reply?",
                "23 contacts opened the quarterly report email but didn't reply within 7 days. The agent wants to send a shorter follow-up with a direct CTA. Estimated cost: $0.92 via SendGrid.",
                "in-app",
                7200
              );
              streamController.enqueue(
                encoder.encode(
                  `2:${JSON.stringify([{ type: "approval-request", request }])}\n`
                )
              );
            } catch {
              // Non-critical
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
 * Handle the deploy action — run deploy pipeline with optional shadow testing.
 *
 * For NEW agents: straight deploy.
 * For UPDATES (previousConfig provided): shadow test → quality eval → deploy or rollback.
 *
 * Streams all events as SSE so the frontend can render deploy progress,
 * shadow test comparisons, and quality reports inline in the chat.
 */
async function handleDeploy(
  agentConfig: AgentConfig,
  credentials: CredentialMap,
  sessionId: string,
  previousConfig?: AgentConfig
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(streamController) {
      try {
        let tokenCount = 0;

        const emitData = (data: unknown[]) => {
          streamController.enqueue(
            encoder.encode(`2:${JSON.stringify(data)}\n`)
          );
        };

        const emitText = (text: string) => {
          tokenCount++;
          streamController.enqueue(
            encoder.encode(`0:${JSON.stringify(text)}\n`)
          );
        };

        // --- If this is an UPDATE, run shadow test first ---
        if (previousConfig) {
          emitText(`\n**Safe Rollout** — Shadow testing v${previousConfig.version} vs v${agentConfig.version}\n\n`);

          const testCases = generateDefaultTestCases(agentConfig);
          emitText(`Running ${testCases.length} test cases against both versions...\n\n`);

          let finalMetrics = null;

          for await (const event of shadowTest(previousConfig, agentConfig, testCases)) {
            emitData([{ type: "shadow-test-event", event }]);

            if (event.type === "shadow-test-progress") {
              emitText(`  Test ${event.testCase}/${event.total}: old=${event.oldResult?.latency}ms new=${event.newResult?.latency}ms\n`);
            }

            if (event.type === "shadow-test-complete") {
              finalMetrics = event;
              emitText(`\nShadow test complete — quality score: ${event.qualityScore}/100\n`);
            }
          }

          // Evaluate quality
          if (finalMetrics && finalMetrics.metrics) {
            const qualityReport = evaluateQuality({
              qualityScore: finalMetrics.qualityScore!,
              passed: finalMetrics.passed!,
              threshold: 80,
              metrics: finalMetrics.metrics,
            });

            emitData([{ type: "quality-report", report: qualityReport }]);
            emitText(formatQualityReport(qualityReport));

            // If rollback recommended, execute rollback and stop
            if (qualityReport.recommendation === "rollback") {
              emitText(`\n**Auto-rollback triggered.** Quality score ${qualityReport.qualityScore} below threshold.\n`);

              const active = getActiveVersion(agentConfig.proxy.agentId);
              const prev = getPreviousVersion(agentConfig.proxy.agentId);
              if (active && prev) {
                const result = await rollbackAgent(agentConfig.proxy.agentId, active.version, prev.version);
                emitData([{ type: "rollback-event", result }]);
                emitText(`\nRolled back: ${result.message}\n`);
              }

              // Finish stream — no deploy
              streamController.enqueue(
                encoder.encode(
                  `d:${JSON.stringify({ finishReason: "stop", usage: { promptTokens: 0, completionTokens: tokenCount } })}\n`
                )
              );
              streamController.close();
              return;
            }

            // If manual review needed, flag it but continue deploy (user approved)
            if (qualityReport.recommendation === "manual-review") {
              emitText(`\n**Manual review recommended.** Proceeding with deploy as requested.\n\n`);
            }
          }
        }

        // --- Deploy ---
        emitText(`\n**Deploying ${agentConfig.name} v${agentConfig.version}**\n\n`);

        const pipeline = new DeployPipeline(agentConfig, credentials, sessionId);

        for await (const event of pipeline.deploy()) {
          emitData([{ type: "deploy-event", event }]);

          // Human-readable text for milestones
          if (event.type === "deploy-progress" && event.status === "complete") {
            emitText(`  [${event.step}] ${event.message}\n`);
          } else if (event.type === "deploy-progress" && event.status === "in-progress") {
            emitText(`> ${event.message}...\n`);
          } else if (event.type === "deploy-complete") {
            recordDeployment(
              event.agentId!,
              agentConfig.version,
              `arn:aws:lambda:${process.env.AWS_REGION || "us-east-1"}:${process.env.AWS_ACCOUNT_ID || "123456789012"}:function:agentlens-${event.agentId}`
            );
            emitText(`\n---\n\n**Deploy complete.**\n- Agent: \`${event.agentId}\`\n- Endpoint: \`${event.endpoint}\`\n- Dashboard: ${event.dashboardUrl}\n`);

            // Stream initial activity feed entries after deploy
            try {
              const feed = await getActivityFeed(event.agentId!, 5);
              if (feed.entries.length > 0) {
                emitData([{ type: "activity-feed", entries: feed.entries }]);
                emitText(`\n**Recent Activity** (${feed.entries.length} runs)\n`);
                for (const entry of feed.entries.slice(0, 3)) {
                  emitText(`- ${entry.summary}\n`);
                }
              }
            } catch {
              // Activity feed is non-critical, don't fail the deploy stream
            }
          } else if (event.type === "deploy-error") {
            emitText(`\n[Deploy Error: ${event.message}]\n`);
          }
        }

        // Finish signal
        streamController.enqueue(
          encoder.encode(
            `d:${JSON.stringify({ finishReason: "stop", usage: { promptTokens: 0, completionTokens: tokenCount } })}\n`
          )
        );
        streamController.close();
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Deploy error";
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

/**
 * Handle the build action — simulate mission execution with progress events.
 *
 * Creates a BuildRunner and streams all progress events as SSE:
 *   - Build events go as `2:` data events (metadata channel)
 *   - Milestone text goes as `0:` text tokens (visible in chat)
 *
 * The stream format enables the frontend to:
 *   1. Show a progress bar / pipeline visualization
 *   2. Run a mini-game while building
 *   3. Pause/resume via the BuildRunner
 */
async function handleBuild(missionMap: MissionMap) {
  const encoder = new TextEncoder();
  const runner = new BuildRunner(missionMap);

  const stream = new ReadableStream({
    async start(streamController) {
      try {
        let tokenCount = 0;

        for await (const event of runner.run()) {
          // Send every event on the data channel
          streamController.enqueue(
            encoder.encode(
              `2:${JSON.stringify([{ type: "build-event", event }])}\n`
            )
          );

          // Also stream human-readable text for key milestones
          const text = buildEventToText(event);
          if (text) {
            tokenCount++;
            streamController.enqueue(
              encoder.encode(`0:${JSON.stringify(text)}\n`)
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
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        streamController.enqueue(
          encoder.encode(
            `2:${JSON.stringify([{ type: "build-event", event: { type: "build-error", message: errMsg } }])}\n`
          )
        );
        streamController.enqueue(
          encoder.encode(
            `0:${JSON.stringify(`\n\n[Build Error: ${errMsg}]`)}\n`
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
 * Convert a BuildEvent to a human-readable text string for the chat.
 * Returns null for events that shouldn't produce visible chat text.
 */
function buildEventToText(event: BuildEvent): string | null {
  switch (event.type) {
    case "build-start":
      return `\n**Building ${event.projectName}** — ${event.totalMissions} missions queued\n\n`;
    case "mission-start":
      return `### Mission ${event.missionId}: ${event.name}\n`;
    case "block-complete":
      return `  [${event.blockName}] done\n`;
    case "task-log":
      return `  > ${event.message}\n`;
    case "mission-complete":
      return `  Mission ${event.missionId} complete.\n\n`;
    case "build-complete": {
      const seconds = Math.round(event.totalTime / 1000);
      return `---\n\nBuild complete in ${seconds}s. All missions shipped.\n`;
    }
    default:
      return null;
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
