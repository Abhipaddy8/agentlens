const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid");
const { estimateCost } = require("../proxy/src/cost");

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  ...(process.env.DYNAMO_ENDPOINT && { endpoint: process.env.DYNAMO_ENDPOINT }),
});
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE = {
  CALLS: process.env.TABLE_CALLS || "agentlens-calls",
  BUDGETS: process.env.TABLE_BUDGETS || "agentlens-budgets",
  CONTROLS: process.env.TABLE_CONTROLS || "agentlens-controls",
  AGENTS: process.env.TABLE_AGENTS || "agentlens-agents",
};

// --- OperaERP Agent Profiles ---
const AGENTS = [
  {
    agentId: "procurement-agent",
    name: "Procurement Agent",
    description: "Analyzes supplier quotes, generates purchase orders, negotiates terms",
    model: "gpt-4o",
    callsPerDay: { min: 45, max: 65 },
    avgInputTokens: { min: 800, max: 2200 },
    avgOutputTokens: { min: 400, max: 1200 },
    // THE VILLAIN: one repeated pattern — "Compare supplier pricing for standard MRO items"
    vilainPattern: {
      prompt: "Compare supplier pricing for standard MRO items across all approved vendors. Include historical pricing trends and recommend optimal purchase timing.",
      frequency: 0.35, // 35% of calls are this exact pattern
    },
  },
  {
    agentId: "customer-support-bot",
    name: "Customer Support Bot",
    description: "Handles inbound tickets, drafts responses, escalates complex issues",
    model: "gpt-4o-mini",
    callsPerDay: { min: 80, max: 120 },
    avgInputTokens: { min: 200, max: 600 },
    avgOutputTokens: { min: 100, max: 400 },
  },
  {
    agentId: "inventory-forecaster",
    name: "Inventory Forecaster",
    description: "Predicts demand, suggests reorder points, flags stockout risks",
    model: "gpt-4o",
    callsPerDay: { min: 15, max: 25 },
    avgInputTokens: { min: 1500, max: 4000 },
    avgOutputTokens: { min: 800, max: 2000 },
  },
  {
    agentId: "supplier-validator",
    name: "Supplier Validator",
    description: "Validates supplier credentials, checks compliance, monitors risk scores",
    model: "gpt-4o-mini",
    callsPerDay: { min: 20, max: 35 },
    avgInputTokens: { min: 500, max: 1500 },
    avgOutputTokens: { min: 200, max: 800 },
    // DAY 14 ANOMALY: looping validation that burned $840 in 3 hours
    anomaly: {
      day: 14,
      startHour: 2, // 2am
      endHour: 5, // 5am
      callsInWindow: 420, // 140/hour for 3 hours
      inputTokens: 3000,
      outputTokens: 1500,
      model: "gpt-4o", // accidentally switched to expensive model
    },
  },
  {
    agentId: "report-generator",
    name: "Report Generator",
    description: "Creates weekly summaries, executive dashboards, compliance reports",
    model: "gpt-4o-mini",
    callsPerDay: { min: 5, max: 12 },
    avgInputTokens: { min: 2000, max: 5000 },
    avgOutputTokens: { min: 1000, max: 3000 },
  },
  {
    agentId: "email-drafter",
    name: "Email Drafter",
    description: "Drafts vendor communications, follow-ups, internal notifications",
    model: "gpt-4o-mini",
    callsPerDay: { min: 25, max: 40 },
    avgInputTokens: { min: 150, max: 400 },
    avgOutputTokens: { min: 100, max: 300 },
  },
];

// --- Helpers ---

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function generateTimestamp(baseDate, dayOffset, hour, minute) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() - dayOffset);
  d.setHours(hour, minute, rand(0, 59), rand(0, 999));
  return d.toISOString();
}

function generateCall(agent, timestamp, overrides = {}) {
  const model = overrides.model || agent.model;
  const inputTokens = overrides.inputTokens || rand(agent.avgInputTokens.min, agent.avgInputTokens.max);
  const outputTokens = overrides.outputTokens || rand(agent.avgOutputTokens.min, agent.avgOutputTokens.max);
  const totalTokens = inputTokens + outputTokens;
  const usage = { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: totalTokens };
  const cost = estimateCost(model, usage);

  return {
    callId: uuidv4(),
    agentId: agent.agentId,
    model,
    requestedModel: overrides.requestedModel || model,
    status: overrides.status || "success",
    timestamp,
    latencyMs: rand(200, 2500),
    inputTokens,
    outputTokens,
    totalTokens,
    inputCost: cost.inputCost,
    outputCost: cost.outputCost,
    totalCost: cost.totalCost,
    cached: overrides.cached || false,
    savedCost: overrides.savedCost || 0,
    routed: overrides.routed || false,
    routingRule: overrides.routingRule || null,
    workflowId: overrides.workflowId || null,
  };
}

// --- Seed Logic ---

async function seed() {
  const now = new Date();
  const calls = [];
  const DAYS = 21; // 3 weeks

  console.log("⚡ OperaERP Demo — Seeding 3 weeks of data\n");

  for (const agent of AGENTS) {
    let agentCalls = 0;
    let agentCost = 0;

    for (let day = 0; day < DAYS; day++) {
      const callCount = rand(agent.callsPerDay.min, agent.callsPerDay.max);

      // Business hours distribution (8am-8pm heavier, some off-hours)
      for (let i = 0; i < callCount; i++) {
        const hour = Math.random() < 0.85 ? rand(8, 19) : rand(0, 23);
        const minute = rand(0, 59);
        const ts = generateTimestamp(now, day, hour, minute);

        let overrides = {};

        // Villain pattern: Procurement Agent repeating same query
        if (agent.vilainPattern && Math.random() < agent.vilainPattern.frequency) {
          // These are the exact same query — cache would catch them
          overrides.cached = false; // they're NOT cached because they didn't have AgentLens
        }

        const call = generateCall(agent, ts, overrides);
        calls.push(call);
        agentCalls++;
        agentCost += call.totalCost;
      }

      // Day 14 anomaly for Supplier Validator
      if (agent.anomaly && day === agent.anomaly.day) {
        console.log(`  ⚠ Day 14 anomaly: ${agent.agentId} — ${agent.anomaly.callsInWindow} calls in 3 hours`);
        for (let i = 0; i < agent.anomaly.callsInWindow; i++) {
          const hour = agent.anomaly.startHour + Math.floor(i / 140);
          const minute = Math.floor((i % 140) / 2.33);
          const ts = generateTimestamp(now, day, hour, minute);

          const call = generateCall(agent, ts, {
            model: agent.anomaly.model,
            inputTokens: agent.anomaly.inputTokens + rand(-200, 200),
            outputTokens: agent.anomaly.outputTokens + rand(-100, 100),
          });
          calls.push(call);
          agentCalls++;
          agentCost += call.totalCost;
        }
      }
    }

    console.log(`  ✓ ${agent.name}: ${agentCalls} calls, $${agentCost.toFixed(2)}`);
  }

  console.log(`\n  Total: ${calls.length} calls\n`);

  // --- Write to DynamoDB ---

  // 1. Register agents
  console.log("  Writing agents...");
  for (const agent of AGENTS) {
    await ddb.send(new PutCommand({
      TableName: TABLE.AGENTS,
      Item: {
        agentId: agent.agentId,
        name: agent.name,
        description: agent.description,
        model: agent.model,
        firstSeen: generateTimestamp(now, 21, 9, 0),
        updatedAt: now.toISOString(),
      },
    }));
  }

  // 2. Write calls in batches of 25
  console.log(`  Writing ${calls.length} call records...`);
  const batches = [];
  for (let i = 0; i < calls.length; i += 25) {
    batches.push(calls.slice(i, i + 25));
  }

  let written = 0;
  for (const batch of batches) {
    try {
      await ddb.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE.CALLS]: batch.map(item => ({
            PutRequest: { Item: item },
          })),
        },
      }));
      written += batch.length;
      if (written % 500 === 0) {
        process.stdout.write(`  ${written}/${calls.length}\r`);
      }
    } catch (err) {
      console.error(`  Batch write failed at ${written}:`, err.message);
    }
  }
  console.log(`  ${written}/${calls.length} calls written`);

  // 3. Set budgets (some agents have limits, procurement doesn't — that's the problem)
  console.log("  Setting budgets...");
  const budgetItems = [
    { agentId: "customer-support-bot", spent: 0, monthlyLimit: 50 },
    { agentId: "email-drafter", spent: 0, monthlyLimit: 20 },
    { agentId: "report-generator", spent: 0, monthlyLimit: 30 },
    // procurement-agent has NO budget limit — part of the story
    // inventory-forecaster and supplier-validator also have no limits
  ];
  for (const b of budgetItems) {
    // Calculate actual spend from calls
    const agentSpend = calls
      .filter(c => c.agentId === b.agentId)
      .reduce((sum, c) => sum + (c.totalCost || 0), 0);
    await ddb.send(new PutCommand({
      TableName: TABLE.BUDGETS,
      Item: { ...b, spent: Math.round(agentSpend * 1000000) / 1000000, updatedAt: now.toISOString() },
    }));
  }

  // 4. Controls — all active (none killed)
  console.log("  Setting controls...");
  for (const agent of AGENTS) {
    await ddb.send(new PutCommand({
      TableName: TABLE.CONTROLS,
      Item: { agentId: agent.agentId, killed: false, updatedAt: now.toISOString() },
    }));
  }

  // Summary
  const totalCost = calls.reduce((s, c) => s + (c.totalCost || 0), 0);
  const procurementCost = calls.filter(c => c.agentId === "procurement-agent").reduce((s, c) => s + (c.totalCost || 0), 0);
  const anomalyCost = calls
    .filter(c => c.agentId === "supplier-validator" && c.model === "gpt-4o")
    .reduce((s, c) => s + (c.totalCost || 0), 0);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("⚡ OperaERP Demo Environment Ready");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Total calls:        ${calls.length}`);
  console.log(`  Total spend:        $${totalCost.toFixed(2)}`);
  console.log(`  Procurement Agent:  $${procurementCost.toFixed(2)} (${(procurementCost/totalCost*100).toFixed(1)}% of total)`);
  console.log(`  Day 14 anomaly:     $${anomalyCost.toFixed(2)} (Supplier Validator on gpt-4o)`);
  console.log(`  Villain pattern:    ~35% of Procurement calls are identical`);
  console.log(`  Agents with budget: 3/6 (procurement has none — that's the point)`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

seed().catch(err => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
