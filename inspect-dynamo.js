const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({
  region: "us-east-1",
  endpoint: "http://localhost:8000",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});
const ddb = DynamoDBDocumentClient.from(client);

async function inspect() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  DynamoDB — Full State Inspection");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 1. CALLS TABLE
  const calls = await ddb.send(new ScanCommand({ TableName: "agentlens-calls" }));
  console.log("\n=== CALLS TABLE (" + calls.Items.length + " records) ===\n");

  const byStatus = {};
  const byAgent = {};
  const byWorkflow = {};
  let totalCost = 0;
  let totalSaved = 0;

  for (const c of calls.Items) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    if (!(c.agentId in byAgent)) byAgent[c.agentId] = { calls: 0, cost: 0, saved: 0 };
    byAgent[c.agentId].calls++;
    byAgent[c.agentId].cost += c.totalCost || 0;
    byAgent[c.agentId].saved += c.savedCost || 0;
    if (c.workflowId) {
      if (!(c.workflowId in byWorkflow)) byWorkflow[c.workflowId] = { calls: 0, cost: 0, agents: new Set() };
      byWorkflow[c.workflowId].calls++;
      byWorkflow[c.workflowId].cost += c.totalCost || 0;
      byWorkflow[c.workflowId].agents.add(c.agentId);
    }
    totalCost += c.totalCost || 0;
    totalSaved += c.savedCost || 0;
  }

  console.log("  By status:");
  for (const [s, count] of Object.entries(byStatus)) {
    console.log("    " + s + ": " + count);
  }

  console.log("\n  By agent:");
  for (const [a, s] of Object.entries(byAgent).sort((x, y) => y[1].cost - x[1].cost)) {
    console.log("    " + a.padEnd(24) + s.calls + " calls  $" + s.cost.toFixed(6) + " cost  $" + s.saved.toFixed(6) + " saved");
  }

  console.log("\n  By workflow:");
  for (const [w, s] of Object.entries(byWorkflow)) {
    console.log("    " + w.padEnd(28) + s.calls + " calls  $" + s.cost.toFixed(6) + "  agents: [" + [...s.agents].join(", ") + "]");
  }

  console.log("\n  TOTALS: $" + totalCost.toFixed(6) + " cost, $" + totalSaved.toFixed(6) + " saved, " + calls.Items.length + " calls");

  // Sample records by type
  const sample = calls.Items.find(c => c.status === "success" && c.totalCost > 0);
  if (sample) {
    console.log("\n  --- Sample SUCCESS record ---");
    console.log("    callId:       " + sample.callId);
    console.log("    agentId:      " + sample.agentId);
    console.log("    model:        " + sample.model);
    console.log("    tokens:       " + sample.inputTokens + " in / " + sample.outputTokens + " out / " + sample.totalTokens + " total");
    console.log("    cost:         $" + (sample.totalCost || 0).toFixed(6));
    console.log("    latency:      " + sample.latencyMs + "ms");
    console.log("    workflowId:   " + (sample.workflowId || "none"));
    console.log("    promptVersion:" + (sample.promptVersion || "none"));
    console.log("    routed:       " + (sample.routed || false));
    console.log("    cached:       " + (sample.cached || false));
  }

  const killed = calls.Items.find(c => c.status === "killed");
  if (killed) {
    console.log("\n  --- Sample KILLED record ---");
    console.log("    agentId: " + killed.agentId + "  latency: " + killed.latencyMs + "ms");
  }

  const rateLtd = calls.Items.find(c => c.status === "rate_limited");
  if (rateLtd) {
    console.log("\n  --- Sample RATE_LIMITED record ---");
    console.log("    agentId: " + rateLtd.agentId + "  limit: " + rateLtd.rateLimit + " RPM  current: " + rateLtd.rateCurrent);
  }

  const cacheHit = calls.Items.find(c => c.status === "cache_hit");
  if (cacheHit) {
    console.log("\n  --- Sample CACHE_HIT record ---");
    console.log("    agentId: " + cacheHit.agentId + "  savedCost: $" + (cacheHit.savedCost || 0).toFixed(6));
  }

  // 2. CACHE TABLE
  const cache = await ddb.send(new ScanCommand({ TableName: "agentlens-cache" }));
  console.log("\n=== CACHE TABLE (" + cache.Items.length + " entries) ===\n");
  for (const c of cache.Items) {
    console.log("    key:" + c.cacheKey.slice(0, 16) + "...  model:" + c.model + "  cached:" + c.cachedAt);
  }

  // 3. CONTROLS TABLE
  const controls = await ddb.send(new ScanCommand({ TableName: "agentlens-controls" }));
  console.log("\n=== CONTROLS TABLE (" + controls.Items.length + " entries) ===\n");
  for (const c of controls.Items) {
    console.log("    " + c.agentId.padEnd(24) + "killed=" + c.killed);
  }

  // 4. BUDGETS TABLE
  const budgets = await ddb.send(new ScanCommand({ TableName: "agentlens-budgets" }));
  console.log("\n=== BUDGETS TABLE (" + budgets.Items.length + " entries) ===\n");
  for (const b of budgets.Items) {
    console.log("    " + b.agentId.padEnd(24) + "spent=$" + (b.spent || 0).toFixed(6) + "  limit=$" + (b.monthlyLimit || "none"));
  }

  // 5. AGENTS TABLE
  const agents = await ddb.send(new ScanCommand({ TableName: "agentlens-agents" }));
  console.log("\n=== AGENTS TABLE (" + agents.Items.length + " registered) ===\n");
  for (const a of agents.Items) {
    console.log("    " + a.agentId.padEnd(24) + "model:" + (a.model || "?").padEnd(24) + "firstSeen:" + a.firstSeen);
  }

  // 6. PROMPT VERSIONS TABLE
  const versions = await ddb.send(new ScanCommand({ TableName: "agentlens-prompt-versions" }));
  console.log("\n=== PROMPT VERSIONS TABLE (" + versions.Items.length + " versions) ===\n");
  for (const v of versions.Items) {
    console.log("    " + v.agentId.padEnd(24) + v.version.padEnd(8) + "calls=" + String(v.callCount).padEnd(4) + " active=" + String(v.active).padEnd(6) + " hash=" + v.promptHash);
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

inspect().catch(e => console.error("Error:", e.message));
