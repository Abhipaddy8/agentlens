/**
 * Standalone demo server.
 * Serves the static OperaERP dataset + dashboard without needing DynamoDB or OpenAI.
 * Perfect for Loom recordings and live demos.
 * v2: supports workflows, rate limits, prompt versions, streaming simulation.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3100;
const DATA_PATH = path.join(__dirname, "opera-erp-data.json");

let demoData = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));

// Ensure workflows array exists
if (!demoData.workflows) {
  demoData.workflows = [
    { workflowId: "wf-procurement-cycle-001", calls: 38, cost: 1.42, agents: ["procurement-agent", "supplier-validator"], agentCount: 2, firstSeen: "2026-02-20T08:00:00Z", lastSeen: "2026-03-10T17:00:00Z" },
    { workflowId: "wf-support-escalation-012", calls: 22, cost: 0.18, agents: ["customer-support-bot", "email-drafter"], agentCount: 2, firstSeen: "2026-03-01T09:00:00Z", lastSeen: "2026-03-10T16:00:00Z" },
    { workflowId: "wf-weekly-report-007", calls: 15, cost: 0.31, agents: ["report-generator", "inventory-forecaster"], agentCount: 2, firstSeen: "2026-03-03T06:00:00Z", lastSeen: "2026-03-10T06:00:00Z" },
  ];
}

// Simulated state
let liveCalls = 0;
const rateLimits = {};
const promptVersions = {};

function jsonResponse(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-agent-id, x-workflow-id, x-prompt-version",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-agent-id, x-workflow-id, x-prompt-version",
    });
    res.end();
    return;
  }

  const url = req.url.split("?")[0];

  // Health
  if (url === "/health" || url === "/") {
    return jsonResponse(res, 200, { status: "ok", service: "agentlens-demo", mode: "opera-erp", version: "2.0.0", timestamp: new Date().toISOString() });
  }

  // Stats (now includes workflows)
  if (url === "/api/stats" && req.method === "GET") {
    return jsonResponse(res, 200, demoData);
  }

  // Controls
  if (url === "/api/controls" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const { agentId, killed } = JSON.parse(body);
        const agent = demoData.agents.find(a => a.agentId === agentId);
        if (agent) agent.killed = killed ? 1 : 0;
        jsonResponse(res, 200, { ok: true, agentId, killed });
      } catch {
        jsonResponse(res, 400, { error: { message: "Invalid JSON" } });
      }
    });
    return;
  }

  // Budgets
  if (url === "/api/budgets" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const { agentId, monthlyLimit } = JSON.parse(body);
        jsonResponse(res, 200, { ok: true, agentId, monthlyLimit });
      } catch {
        jsonResponse(res, 400, { error: { message: "Invalid JSON" } });
      }
    });
    return;
  }

  // Rate limits — set
  if (url === "/api/rate-limits" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const { agentId, rpm } = JSON.parse(body);
        rateLimits[agentId] = rpm;
        jsonResponse(res, 200, { ok: true, agentId, rpm });
      } catch {
        jsonResponse(res, 400, { error: { message: "Invalid JSON" } });
      }
    });
    return;
  }

  // Rate limits — get
  if (url === "/api/rate-limits" && req.method === "GET") {
    const statuses = demoData.agents.map(a => ({
      agentId: a.agentId,
      current: Math.floor(Math.random() * 10),
      limit: rateLimits[a.agentId] || 60,
      utilization: Math.floor(Math.random() * 30),
    }));
    return jsonResponse(res, 200, { rateLimits: statuses });
  }

  // Prompt versions — get
  if (url.startsWith("/api/versions/") && url !== "/api/versions/rollback" && req.method === "GET") {
    const agentId = url.split("/")[3];
    const versions = promptVersions[agentId] || [
      { agentId, version: "v1.0", promptHash: "abc123", callCount: 142, active: false, createdAt: "2026-02-18T10:00:00Z", lastUsed: "2026-03-01T10:00:00Z", lastLatencyMs: 1200 },
      { agentId, version: "v1.1", promptHash: "def456", callCount: 89, active: false, createdAt: "2026-03-01T10:00:00Z", lastUsed: "2026-03-07T10:00:00Z", lastLatencyMs: 980 },
      { agentId, version: "v2.0", promptHash: "ghi789", callCount: 34, active: true, createdAt: "2026-03-07T10:00:00Z", lastUsed: "2026-03-10T10:00:00Z", lastLatencyMs: 850 },
    ];
    return jsonResponse(res, 200, { agentId, versions });
  }

  // Prompt versions — rollback
  if (url === "/api/versions/rollback" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const { agentId, version } = JSON.parse(body);
        jsonResponse(res, 200, { ok: true, agentId, activeVersion: version });
      } catch {
        jsonResponse(res, 400, { error: { message: "Invalid JSON" } });
      }
    });
    return;
  }

  // Simulated chat completions (for live simulator)
  if (url === "/v1/chat/completions" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const agentId = req.headers["x-agent-id"] || "simulator-agent";
        const workflowId = req.headers["x-workflow-id"] || null;
        const promptVersion = req.headers["x-prompt-version"] || null;
        liveCalls++;

        // Check if agent is killed
        const agent = demoData.agents.find(a => a.agentId === agentId);
        if (agent && agent.killed) {
          return jsonResponse(res, 403, {
            error: { message: `Agent '${agentId}' is currently disabled via AgentLens kill switch.`, type: "agent_killed" },
          });
        }

        // Streaming simulation
        if (parsed.stream) {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
          });

          const prompt = parsed.messages?.[parsed.messages.length - 1]?.content || "";
          const words = `Here's a streamed response about "${prompt.slice(0, 30)}" from the OperaERP demo environment.`.split(" ");
          let i = 0;

          const interval = setInterval(() => {
            if (i < words.length) {
              const chunk = {
                id: `chatcmpl-demo-${liveCalls}`,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: parsed.model || "gpt-4o-mini",
                choices: [{ index: 0, delta: { content: (i > 0 ? " " : "") + words[i] }, finish_reason: null }],
              };
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
              i++;
            } else {
              const done = {
                id: `chatcmpl-demo-${liveCalls}`,
                object: "chat.completion.chunk",
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
                usage: { prompt_tokens: 25, completion_tokens: words.length, total_tokens: 25 + words.length },
              };
              res.write(`data: ${JSON.stringify(done)}\n\n`);
              res.write("data: [DONE]\n\n");
              res.end();
              clearInterval(interval);
            }
          }, 50);

          return;
        }

        // Non-streaming
        const prompt = parsed.messages?.[parsed.messages.length - 1]?.content || "";
        const isCacheHit = liveCalls > 1 && liveCalls % 2 === 0;
        const fakeUsage = { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 };

        // Update stats
        if (agent) {
          agent.calls++;
          if (isCacheHit) {
            agent.cacheHits++;
            agent.saved += 0.0004;
            demoData.overview.totalSaved += 0.0004;
          } else {
            agent.cost += 0.0004;
            demoData.overview.totalCost += 0.0004;
          }
          demoData.overview.totalCalls++;
        }

        return jsonResponse(res, 200, {
          id: `chatcmpl-demo-${liveCalls}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: parsed.model || "gpt-4o-mini",
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: isCacheHit
                ? `[CACHE HIT] Here's the cached response for your query about "${prompt.slice(0, 40)}..."`
                : `Here's a response about "${prompt.slice(0, 40)}..." — This is a demo response from the OperaERP environment.`,
            },
            finish_reason: "stop",
          }],
          usage: fakeUsage,
          _agentlens: { cached: isCacheHit, agentId, workflowId, promptVersion, callNumber: liveCalls },
        });
      } catch {
        jsonResponse(res, 400, { error: { message: "Invalid JSON" } });
      }
    });
    return;
  }

  jsonResponse(res, 404, { error: { message: "Not found" } });
});

server.listen(PORT, () => {
  console.log(`\n⚡ AgentLens Demo Server v2 — OperaERP`);
  console.log(`  http://localhost:${PORT}\n`);
  console.log(`  GET  /api/stats             — Dashboard data (${demoData.agents.length} agents, ${demoData.overview.totalCalls} calls, ${demoData.workflows.length} workflows)`);
  console.log(`  POST /v1/chat/completions   — Simulated endpoint (streaming + non-streaming)`);
  console.log(`  POST /api/controls          — Kill switches`);
  console.log(`  POST /api/budgets           — Budget limits`);
  console.log(`  POST /api/rate-limits       — Rate limit config`);
  console.log(`  GET  /api/rate-limits       — Rate limit status`);
  console.log(`  GET  /api/versions/:agentId — Prompt versions`);
  console.log(`  POST /api/versions/rollback — Rollback prompt version\n`);
  console.log(`  Villain: procurement-agent — ${(demoData.agents.find(a=>a.agentId==='procurement-agent')?.cost / demoData.overview.totalCost * 100).toFixed(1)}% of spend`);
  console.log(`  Anomaly: supplier-validator — Day 14, 420 calls on gpt-4o\n`);
  console.log(`  Point your dashboard at http://localhost:${PORT}\n`);
});
