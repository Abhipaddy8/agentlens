/**
 * Vercel serverless function — serves OperaERP demo data.
 * Replaces demo-server.js for the public Vercel deployment.
 * All 9 dashboard screens show meaningful data.
 */

const SEED_DATA = {
  overview: {
    totalCalls: 5527, totalCost: 32.83, totalSaved: 8.42,
    cacheHitRate: 0.28, routedCalls: 312, killedCalls: 5, budgetBlocked: 2
  },
  agents: [
    { agentId: "procurement-agent", calls: 1158, cost: 13.53, saved: 1.82, cacheHits: 89, routed: 0, killed: 3, budgetBlocked: 1 },
    { agentId: "supplier-validator", calls: 1027, cost: 9.74, saved: 0.94, cacheHits: 42, routed: 0, killed: 2, budgetBlocked: 1 },
    { agentId: "inventory-forecaster", calls: 419, cost: 8.73, saved: 0.61, cacheHits: 28, routed: 87, killed: 0, budgetBlocked: 0 },
    { agentId: "customer-support-bot", calls: 2057, cost: 0.43, saved: 3.12, cacheHits: 892, routed: 156, killed: 0, budgetBlocked: 0 },
    { agentId: "report-generator", calls: 165, cost: 0.28, saved: 0.08, cacheHits: 12, routed: 69, killed: 0, budgetBlocked: 0 },
    { agentId: "email-drafter", calls: 701, cost: 0.11, saved: 1.85, cacheHits: 487, routed: 0, killed: 0, budgetBlocked: 0 },
  ],
  workflows: [
    { workflowId: "wf-procurement-cycle-001", calls: 38, cost: 1.42, agents: ["procurement-agent", "supplier-validator"], agentCount: 2, firstSeen: "2026-02-20T08:00:00Z", lastSeen: "2026-03-10T17:00:00Z" },
    { workflowId: "wf-support-escalation-012", calls: 22, cost: 0.18, agents: ["customer-support-bot", "email-drafter"], agentCount: 2, firstSeen: "2026-03-01T09:00:00Z", lastSeen: "2026-03-10T16:00:00Z" },
    { workflowId: "wf-weekly-report-007", calls: 15, cost: 0.31, agents: ["report-generator", "inventory-forecaster"], agentCount: 2, firstSeen: "2026-03-03T06:00:00Z", lastSeen: "2026-03-10T06:00:00Z" },
  ],
  cache: {
    totalHits: 1550,
    totalMisses: 3977,
    hitRate: 0.28,
    avgHitLatencyMs: 14,
    avgMissLatencyMs: 3280,
    speedup: "234x",
    byAgent: [
      { agentId: "customer-support-bot", hits: 892, misses: 1165, hitRate: 0.43, saved: 3.12 },
      { agentId: "email-drafter", hits: 487, misses: 214, hitRate: 0.69, saved: 1.85 },
      { agentId: "procurement-agent", hits: 89, misses: 1069, hitRate: 0.08, saved: 1.82 },
      { agentId: "supplier-validator", hits: 42, misses: 985, hitRate: 0.04, saved: 0.94 },
      { agentId: "inventory-forecaster", hits: 28, misses: 391, hitRate: 0.07, saved: 0.61 },
      { agentId: "report-generator", hits: 12, misses: 153, hitRate: 0.07, saved: 0.08 },
    ],
    insights: [
      "email-drafter has 69% cache hit rate — most repetitive queries in the system",
      "customer-support-bot saves $3.12/month from caching alone — FAQ responses are highly cacheable",
      "procurement-agent has only 8% hit rate — queries are too unique to cache effectively"
    ]
  },
  routing: {
    totalRouted: 312,
    totalSavedByRouting: 4.87,
    rules: [
      { from: "gpt-4o", to: "gpt-4o-mini", condition: "tokens < 200 AND topic = 'simple_query'", callsRouted: 156, saved: 2.94 },
      { from: "gpt-4o", to: "gpt-4o-mini", condition: "agent = 'report-generator' AND task = 'formatting'", callsRouted: 69, saved: 1.12 },
      { from: "gpt-4o", to: "gpt-4o-mini", condition: "agent = 'inventory-forecaster' AND task = 'lookup'", callsRouted: 87, saved: 0.81 },
    ],
    byAgent: [
      { agentId: "customer-support-bot", routed: 156, originalCost: 3.37, actualCost: 0.43, saved: 2.94 },
      { agentId: "report-generator", routed: 69, originalCost: 1.40, actualCost: 0.28, saved: 1.12 },
      { agentId: "inventory-forecaster", routed: 87, originalCost: 9.54, actualCost: 8.73, saved: 0.81 },
    ],
    costComparison: {
      withoutRouting: 37.70,
      withRouting: 32.83,
      savingsPercent: 12.9
    }
  },
  meta: {
    company: "OperaERP",
    description: "Mid-size manufacturing company - 6 AI agents, 3 weeks of data",
    generatedAt: "2026-03-10T07:25:47.359Z",
    villain: "procurement-agent - 42% of spend",
    anomaly: "supplier-validator - Day 14, looped for 3 hours, 420 calls on gpt-4o"
  }
};

let demoData = JSON.parse(JSON.stringify(SEED_DATA));
let liveCalls = 0;
const rateLimits = {};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-agent-id, x-workflow-id, x-prompt-version");
}

export default function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const url = req.url.split("?")[0];

  if (url === "/health" || url === "/") {
    return res.json({ status: "ok", service: "agentlens-demo", mode: "opera-erp", version: "2.0.0" });
  }

  if (url === "/api/stats") {
    return res.json(demoData);
  }

  if (url === "/api/controls" && req.method === "POST") {
    const { agentId, killed } = req.body || {};
    const agent = demoData.agents.find(a => a.agentId === agentId);
    if (agent) agent.killed = killed ? 1 : 0;
    return res.json({ ok: true, agentId, killed });
  }

  if (url === "/api/budgets" && req.method === "POST") {
    const { agentId, monthlyLimit } = req.body || {};
    return res.json({ ok: true, agentId, monthlyLimit });
  }

  if (url === "/api/rate-limits" && req.method === "POST") {
    const { agentId, rpm } = req.body || {};
    rateLimits[agentId] = rpm;
    return res.json({ ok: true, agentId, rpm });
  }

  if (url === "/api/rate-limits" && req.method === "GET") {
    const statuses = demoData.agents.map(a => ({
      agentId: a.agentId,
      current: Math.floor(Math.random() * 10),
      limit: rateLimits[a.agentId] || 60,
      utilization: Math.floor(Math.random() * 30),
    }));
    return res.json({ rateLimits: statuses });
  }

  if (url.startsWith("/api/versions/") && url !== "/api/versions/rollback" && req.method === "GET") {
    const agentId = url.split("/")[3];
    const versions = [
      { agentId, version: "v1.0", promptHash: "abc123", callCount: 142, active: false, createdAt: "2026-02-18T10:00:00Z", lastUsed: "2026-03-01T10:00:00Z", lastLatencyMs: 1200 },
      { agentId, version: "v1.1", promptHash: "def456", callCount: 89, active: false, createdAt: "2026-03-01T10:00:00Z", lastUsed: "2026-03-07T10:00:00Z", lastLatencyMs: 980 },
      { agentId, version: "v2.0", promptHash: "ghi789", callCount: 34, active: true, createdAt: "2026-03-07T10:00:00Z", lastUsed: "2026-03-10T10:00:00Z", lastLatencyMs: 850 },
    ];
    return res.json({ agentId, versions });
  }

  if (url === "/api/versions/rollback" && req.method === "POST") {
    const { agentId, version } = req.body || {};
    return res.json({ ok: true, agentId, activeVersion: version });
  }

  if (url === "/v1/chat/completions" && req.method === "POST") {
    const parsed = req.body || {};
    const agentId = req.headers["x-agent-id"] || "simulator-agent";
    liveCalls++;

    const agent = demoData.agents.find(a => a.agentId === agentId);
    if (agent && agent.killed) {
      return res.status(403).json({
        error: { message: `Agent '${agentId}' is currently disabled via AgentLens kill switch.`, type: "agent_killed" },
      });
    }

    const prompt = parsed.messages?.[parsed.messages.length - 1]?.content || "";
    const isCacheHit = liveCalls > 1 && liveCalls % 2 === 0;

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

    return res.json({
      id: `chatcmpl-demo-${liveCalls}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: parsed.model || "gpt-4o-mini",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: isCacheHit
            ? `[CACHE HIT] Cached response for "${prompt.slice(0, 40)}..."`
            : `Response about "${prompt.slice(0, 40)}..." from OperaERP demo.`,
        },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 },
      _agentlens: { cached: isCacheHit, agentId, callNumber: liveCalls },
    });
  }

  return res.status(404).json({ error: { message: "Not found" } });
}
