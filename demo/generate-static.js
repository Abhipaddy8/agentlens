/**
 * Generates a static demo dataset as JSON.
 * Use this when you don't have DynamoDB running —
 * the dashboard can load this file directly.
 */
const { v4: uuidv4 } = require("uuid");
const { estimateCost } = require("../proxy/src/cost");
const fs = require("fs");
const path = require("path");

const AGENTS = [
  { agentId: "procurement-agent", name: "Procurement Agent", model: "gpt-4o", callsPerDay: [45, 65], inputTok: [800, 2200], outputTok: [400, 1200], villainFreq: 0.35 },
  { agentId: "customer-support-bot", name: "Customer Support Bot", model: "gpt-4o-mini", callsPerDay: [80, 120], inputTok: [200, 600], outputTok: [100, 400] },
  { agentId: "inventory-forecaster", name: "Inventory Forecaster", model: "gpt-4o", callsPerDay: [15, 25], inputTok: [1500, 4000], outputTok: [800, 2000] },
  { agentId: "supplier-validator", name: "Supplier Validator", model: "gpt-4o-mini", callsPerDay: [20, 35], inputTok: [500, 1500], outputTok: [200, 800], anomalyDay: 14, anomalyCalls: 420, anomalyModel: "gpt-4o" },
  { agentId: "report-generator", name: "Report Generator", model: "gpt-4o-mini", callsPerDay: [5, 12], inputTok: [2000, 5000], outputTok: [1000, 3000] },
  { agentId: "email-drafter", name: "Email Drafter", model: "gpt-4o-mini", callsPerDay: [25, 40], inputTok: [150, 400], outputTok: [100, 300] },
];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function generate() {
  const now = new Date();
  const agentStats = {};
  let totalCost = 0;
  let totalCalls = 0;

  for (const agent of AGENTS) {
    const stats = { agentId: agent.agentId, calls: 0, cost: 0, saved: 0, cacheHits: 0, routed: 0, killed: 0, budgetBlocked: 0 };

    for (let day = 0; day < 21; day++) {
      const callCount = rand(agent.callsPerDay[0], agent.callsPerDay[1]);
      for (let i = 0; i < callCount; i++) {
        const inputTokens = rand(agent.inputTok[0], agent.inputTok[1]);
        const outputTokens = rand(agent.outputTok[0], agent.outputTok[1]);
        const cost = estimateCost(agent.model, { prompt_tokens: inputTokens, completion_tokens: outputTokens });
        stats.calls++;
        stats.cost += cost.totalCost;
        totalCost += cost.totalCost;
        totalCalls++;
      }

      // Anomaly
      if (agent.anomalyDay === day) {
        for (let i = 0; i < agent.anomalyCalls; i++) {
          const inputTokens = 3000 + rand(-200, 200);
          const outputTokens = 1500 + rand(-100, 100);
          const cost = estimateCost(agent.anomalyModel, { prompt_tokens: inputTokens, completion_tokens: outputTokens });
          stats.calls++;
          stats.cost += cost.totalCost;
          totalCost += cost.totalCost;
          totalCalls++;
        }
      }
    }

    // Round
    stats.cost = Math.round(stats.cost * 100) / 100;
    agentStats[agent.agentId] = stats;
  }

  const result = {
    overview: {
      totalCalls,
      totalCost: Math.round(totalCost * 100) / 100,
      totalSaved: 0,
      cacheHitRate: 0,
      routedCalls: 0,
      killedCalls: 0,
      budgetBlocked: 0,
    },
    agents: Object.values(agentStats).sort((a, b) => b.cost - a.cost),
    meta: {
      company: "OperaERP",
      description: "Mid-size manufacturing company — 6 AI agents, 3 weeks of data",
      generatedAt: now.toISOString(),
      villain: "procurement-agent — 42% of spend, one repeated query pattern burning $1,840/month",
      anomaly: "supplier-validator — Day 14, looped for 3 hours, 420 calls on gpt-4o, ~$840",
    },
  };

  const outPath = path.join(__dirname, "opera-erp-data.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.log("⚡ OperaERP static dataset generated");
  console.log(`  File: ${outPath}`);
  console.log(`  Total calls: ${totalCalls}`);
  console.log(`  Total spend: $${result.overview.totalCost}`);
  console.log(`  Procurement Agent: $${agentStats["procurement-agent"].cost} (${(agentStats["procurement-agent"].cost / totalCost * 100).toFixed(1)}%)`);
  console.log(`  Supplier Validator anomaly included`);

  return result;
}

generate();
