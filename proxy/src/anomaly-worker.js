/**
 * AgentLens Anomaly Detection Worker
 *
 * Lambda function triggered every 5 minutes via CloudWatch Events.
 * Scans recent call data from DynamoDB and applies 5 detection rules:
 *
 *  1. spend_spike     — Agent hourly spend > 3x rolling average → auto-freeze + alert
 *  2. loop_detected   — Same agent + query hash > 10x in 5 min → auto-freeze + alert
 *  3. budget_warning  — Monthly spend > 90% of ceiling → auto-downgrade model + alert
 *  4. error_spike     — Error rate > 10% in 10 min window → alert only
 *  5. concentration   — Single agent > 45% of total spend → alert only
 *
 * Freeze = write `killed: true` to controls table (next proxy call hits kill switch)
 * Alert = POST to SLACK_WEBHOOK_URL env var (optional — skip if not set)
 * Log = Write anomaly record to agentlens-anomalies DynamoDB table
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid");
const https = require("https");
const crypto = require("crypto");

// --- DynamoDB Setup (same pattern as proxy) ---

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  ...(process.env.DYNAMO_ENDPOINT && {
    endpoint: process.env.DYNAMO_ENDPOINT,
    credentials: { accessKeyId: "local", secretAccessKey: "local" },
  }),
});

const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE = {
  CALLS: process.env.TABLE_CALLS || "agentlens-calls",
  BUDGETS: process.env.TABLE_BUDGETS || "agentlens-budgets",
  CONTROLS: process.env.TABLE_CONTROLS || "agentlens-controls",
  AGENTS: process.env.TABLE_AGENTS || "agentlens-agents",
  ANOMALIES: process.env.TABLE_ANOMALIES || "agentlens-anomalies",
};

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || null;

// --- Constants ---

const SPEND_SPIKE_MULTIPLIER = 3;       // hourly spend > 3x rolling avg
const LOOP_THRESHOLD = 10;              // same query hash > 10x in 5 min
const LOOP_WINDOW_MS = 5 * 60 * 1000;   // 5 minutes
const BUDGET_WARNING_PCT = 0.9;          // 90% of ceiling
const ERROR_RATE_THRESHOLD = 0.1;        // 10% error rate
const ERROR_WINDOW_MS = 10 * 60 * 1000;  // 10 minutes
const CONCENTRATION_THRESHOLD = 0.45;    // 45% of total spend
const SCAN_WINDOW_MS = 60 * 60 * 1000;   // scan last 1 hour of data

// --- Main Handler ---

exports.handler = async (event) => {
  const runId = uuidv4().slice(0, 8);
  console.log(`[anomaly-worker:${runId}] Starting anomaly detection scan`);

  const results = {
    rulesChecked: 0,
    anomaliesFound: 0,
    errors: 0,
    details: [],
  };

  try {
    // Step 1: Fetch recent calls (last 1 hour) across all agents
    const recentCalls = await fetchRecentCalls();
    console.log(`[anomaly-worker:${runId}] Fetched ${recentCalls.length} calls from last hour`);

    if (recentCalls.length === 0) {
      console.log(`[anomaly-worker:${runId}] No recent calls. Skipping checks.`);
      return { statusCode: 200, body: JSON.stringify(results) };
    }

    // Group calls by agent
    const callsByAgent = groupByAgent(recentCalls);
    const agentIds = Object.keys(callsByAgent);

    // Step 2: Run each detection rule independently
    // If one fails, continue to the next

    // Rule 1: Spend Spike
    try {
      results.rulesChecked++;
      const spikes = await checkSpendSpike(callsByAgent);
      for (const spike of spikes) {
        results.anomaliesFound++;
        results.details.push(spike);
      }
    } catch (err) {
      results.errors++;
      console.error(`[anomaly-worker:${runId}] spend_spike check failed:`, err.message);
    }

    // Rule 2: Loop Detection
    try {
      results.rulesChecked++;
      const loops = await checkLoopDetection(callsByAgent);
      for (const loop of loops) {
        results.anomaliesFound++;
        results.details.push(loop);
      }
    } catch (err) {
      results.errors++;
      console.error(`[anomaly-worker:${runId}] loop_detected check failed:`, err.message);
    }

    // Rule 3: Budget Warning
    try {
      results.rulesChecked++;
      const warnings = await checkBudgetWarning(agentIds);
      for (const warning of warnings) {
        results.anomaliesFound++;
        results.details.push(warning);
      }
    } catch (err) {
      results.errors++;
      console.error(`[anomaly-worker:${runId}] budget_warning check failed:`, err.message);
    }

    // Rule 4: Error Spike
    try {
      results.rulesChecked++;
      const errorSpikes = checkErrorSpike(callsByAgent);
      for (const es of errorSpikes) {
        results.anomaliesFound++;
        results.details.push(es);
      }
    } catch (err) {
      results.errors++;
      console.error(`[anomaly-worker:${runId}] error_spike check failed:`, err.message);
    }

    // Rule 5: Concentration
    try {
      results.rulesChecked++;
      const concentrations = checkConcentration(callsByAgent);
      for (const c of concentrations) {
        results.anomaliesFound++;
        results.details.push(c);
      }
    } catch (err) {
      results.errors++;
      console.error(`[anomaly-worker:${runId}] concentration check failed:`, err.message);
    }

    console.log(`[anomaly-worker:${runId}] Scan complete. ${results.anomaliesFound} anomalies found, ${results.errors} rule errors.`);

  } catch (err) {
    // Top-level catch: if fetching calls fails entirely
    console.error(`[anomaly-worker:${runId}] Fatal error:`, err.message);
    results.errors++;
  }

  return { statusCode: 200, body: JSON.stringify(results) };
};

// ===========================================
// Data Fetching
// ===========================================

/**
 * Fetch all calls from the last hour using a Scan with timestamp filter.
 * The calls table PK is agentId, SK is callId, with a GSI on (agentId, timestamp).
 * We need all agents, so we do a full Scan with a timestamp filter.
 */
async function fetchRecentCalls() {
  const cutoff = new Date(Date.now() - SCAN_WINDOW_MS).toISOString();
  const items = [];

  try {
    let lastKey = undefined;
    do {
      const res = await ddb.send(new ScanCommand({
        TableName: TABLE.CALLS,
        FilterExpression: "#ts >= :cutoff",
        ExpressionAttributeNames: { "#ts": "timestamp", "#s": "status" },
        ExpressionAttributeValues: { ":cutoff": cutoff },
        ProjectionExpression: "agentId, callId, #ts, #s, totalCost, model, latencyMs, inputTokens, outputTokens, workflowId, requestedModel",
        ...(lastKey && { ExclusiveStartKey: lastKey }),
      }));
      items.push(...(res.Items || []));
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
  } catch (err) {
    console.error("[anomaly-worker] Failed to fetch recent calls:", err.message);
    throw err;
  }

  return items;
}

/**
 * Group calls by agentId.
 */
function groupByAgent(calls) {
  const groups = {};
  for (const call of calls) {
    const id = call.agentId || "unknown";
    if (!groups[id]) groups[id] = [];
    groups[id].push(call);
  }
  return groups;
}

// ===========================================
// Rule 1: Spend Spike
// ===========================================

/**
 * Agent hourly spend > 3x rolling average.
 * Rolling average = total cost in the last hour / number of distinct hours with data.
 * We compare the most recent 5-minute spend (annualized to hourly) vs the hour average.
 */
async function checkSpendSpike(callsByAgent) {
  const anomalies = [];
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  for (const [agentId, calls] of Object.entries(callsByAgent)) {
    if (agentId === "unknown") continue;

    // Total spend in last hour
    const hourlySpend = calls.reduce((sum, c) => sum + (c.totalCost || 0), 0);
    if (hourlySpend === 0) continue;

    // Recent 5-min spend, projected to hourly rate
    const recentCalls = calls.filter(c => c.timestamp >= fiveMinAgo);
    const recentSpend = recentCalls.reduce((sum, c) => sum + (c.totalCost || 0), 0);
    const projectedHourlyRate = recentSpend * 12; // 5 min * 12 = 1 hour

    // Average hourly rate (total hour spend is the baseline)
    // If projected rate > 3x the hourly average, flag it
    if (projectedHourlyRate > hourlySpend * SPEND_SPIKE_MULTIPLIER && recentSpend > 0.01) {
      const anomaly = {
        rule: "spend_spike",
        agentId,
        action: "freeze",
        details: {
          projectedHourlyRate: round(projectedHourlyRate),
          hourlyAverage: round(hourlySpend),
          multiplier: round(projectedHourlyRate / hourlySpend),
          recentCalls: recentCalls.length,
          threshold: `${SPEND_SPIKE_MULTIPLIER}x`,
        },
      };

      await freezeAgent(agentId, "spend_spike");
      await logAnomaly(anomaly);
      await sendAlert(anomaly);
      anomalies.push(anomaly);
    }
  }

  return anomalies;
}

// ===========================================
// Rule 2: Loop Detection
// ===========================================

/**
 * Same agent + query hash > 10x in 5 minutes.
 * We hash the model + requestedModel as a simple fingerprint.
 * In production, the messages content hash would be better, but we work with what's in the calls table.
 */
async function checkLoopDetection(callsByAgent) {
  const anomalies = [];
  const windowCutoff = new Date(Date.now() - LOOP_WINDOW_MS).toISOString();

  for (const [agentId, calls] of Object.entries(callsByAgent)) {
    if (agentId === "unknown") continue;

    // Filter to last 5 minutes
    const recentCalls = calls.filter(c => c.timestamp >= windowCutoff);
    if (recentCalls.length < LOOP_THRESHOLD) continue;

    // Group by model (proxy for query pattern — same model + same agent in rapid succession = loop)
    const modelCounts = {};
    for (const call of recentCalls) {
      const key = call.model || call.requestedModel || "unknown";
      modelCounts[key] = (modelCounts[key] || 0) + 1;
    }

    for (const [model, count] of Object.entries(modelCounts)) {
      if (count >= LOOP_THRESHOLD) {
        const anomaly = {
          rule: "loop_detected",
          agentId,
          action: "freeze",
          details: {
            model,
            callCount: count,
            windowMinutes: LOOP_WINDOW_MS / 60000,
            threshold: LOOP_THRESHOLD,
          },
        };

        await freezeAgent(agentId, "loop_detected");
        await logAnomaly(anomaly);
        await sendAlert(anomaly);
        anomalies.push(anomaly);
        break; // One loop alert per agent is enough
      }
    }
  }

  return anomalies;
}

// ===========================================
// Rule 3: Budget Warning
// ===========================================

/**
 * Monthly spend > 90% of budget ceiling.
 * Reads from budgets table. If agent has a monthlyLimit and spent > 90%, alert.
 * Also auto-downgrades model by writing a routing override (future — for now, alert + flag).
 */
async function checkBudgetWarning(agentIds) {
  const anomalies = [];

  for (const agentId of agentIds) {
    if (agentId === "unknown") continue;

    try {
      const res = await ddb.send(new GetCommand({
        TableName: TABLE.BUDGETS,
        Key: { agentId },
      }));

      if (!res.Item) continue;
      const { spent = 0, monthlyLimit } = res.Item;
      if (!monthlyLimit || monthlyLimit <= 0) continue;

      const pct = spent / monthlyLimit;
      if (pct >= BUDGET_WARNING_PCT) {
        const anomaly = {
          rule: "budget_warning",
          agentId,
          action: "downgrade",
          details: {
            spent: round(spent),
            monthlyLimit: round(monthlyLimit),
            percentUsed: round(pct * 100),
            threshold: `${BUDGET_WARNING_PCT * 100}%`,
          },
        };

        // Auto-downgrade: write a model override to controls table
        await writeModelDowngrade(agentId);
        await logAnomaly(anomaly);
        await sendAlert(anomaly);
        anomalies.push(anomaly);
      }
    } catch (err) {
      console.error(`[anomaly-worker] budget_warning check failed for ${agentId}:`, err.message);
    }
  }

  return anomalies;
}

// ===========================================
// Rule 4: Error Spike
// ===========================================

/**
 * Error rate > 10% in 10-minute window.
 * Counts calls with status containing "error" vs total.
 */
function checkErrorSpike(callsByAgent) {
  const anomalies = [];
  const windowCutoff = new Date(Date.now() - ERROR_WINDOW_MS).toISOString();

  for (const [agentId, calls] of Object.entries(callsByAgent)) {
    if (agentId === "unknown") continue;

    const recentCalls = calls.filter(c => c.timestamp >= windowCutoff);
    if (recentCalls.length < 5) continue; // Need minimum sample size

    const errorCalls = recentCalls.filter(c =>
      c.status === "upstream_error" || c.status === "error" || (c.status && c.status.includes("error"))
    );

    const errorRate = errorCalls.length / recentCalls.length;
    if (errorRate > ERROR_RATE_THRESHOLD) {
      const anomaly = {
        rule: "error_spike",
        agentId,
        action: "alert",
        details: {
          errorRate: round(errorRate * 100),
          errorCount: errorCalls.length,
          totalCalls: recentCalls.length,
          windowMinutes: ERROR_WINDOW_MS / 60000,
          threshold: `${ERROR_RATE_THRESHOLD * 100}%`,
        },
      };

      // Alert only — don't freeze
      logAnomaly(anomaly).catch(() => {});
      sendAlert(anomaly).catch(() => {});
      anomalies.push(anomaly);
    }
  }

  return anomalies;
}

// ===========================================
// Rule 5: Concentration
// ===========================================

/**
 * Single agent > 45% of total spend.
 */
function checkConcentration(callsByAgent) {
  const anomalies = [];

  // Calculate total spend across all agents
  let totalSpend = 0;
  const agentSpends = {};

  for (const [agentId, calls] of Object.entries(callsByAgent)) {
    const spend = calls.reduce((sum, c) => sum + (c.totalCost || 0), 0);
    agentSpends[agentId] = spend;
    totalSpend += spend;
  }

  if (totalSpend <= 0) return anomalies;

  for (const [agentId, spend] of Object.entries(agentSpends)) {
    if (agentId === "unknown") continue;

    const pct = spend / totalSpend;
    if (pct > CONCENTRATION_THRESHOLD) {
      const anomaly = {
        rule: "concentration",
        agentId,
        action: "alert",
        details: {
          agentSpend: round(spend),
          totalSpend: round(totalSpend),
          percentOfTotal: round(pct * 100),
          threshold: `${CONCENTRATION_THRESHOLD * 100}%`,
        },
      };

      // Alert only — don't freeze
      logAnomaly(anomaly).catch(() => {});
      sendAlert(anomaly).catch(() => {});
      anomalies.push(anomaly);
    }
  }

  return anomalies;
}

// ===========================================
// Actions
// ===========================================

/**
 * Freeze an agent by writing `killed: true` to the controls table.
 * Next proxy call for this agent will hit the kill switch.
 */
async function freezeAgent(agentId, reason) {
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE.CONTROLS,
      Key: { agentId },
      UpdateExpression: "SET killed = :killed, killedBy = :by, killedAt = :now, updatedAt = :now",
      ExpressionAttributeValues: {
        ":killed": true,
        ":by": `anomaly-worker:${reason}`,
        ":now": new Date().toISOString(),
      },
    }));
    console.log(`[anomaly-worker] FROZEN agent '${agentId}' — reason: ${reason}`);
  } catch (err) {
    console.error(`[anomaly-worker] Failed to freeze agent '${agentId}':`, err.message);
  }
}

/**
 * Write a model downgrade flag to the controls table.
 * The proxy router can read this to force cheaper models.
 */
async function writeModelDowngrade(agentId) {
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE.CONTROLS,
      Key: { agentId },
      UpdateExpression: "SET modelDowngrade = :dg, downgradeReason = :reason, updatedAt = :now",
      ExpressionAttributeValues: {
        ":dg": true,
        ":reason": "budget_warning_90pct",
        ":now": new Date().toISOString(),
      },
    }));
    console.log(`[anomaly-worker] Model downgrade set for agent '${agentId}'`);
  } catch (err) {
    console.error(`[anomaly-worker] Failed to set model downgrade for '${agentId}':`, err.message);
  }
}

/**
 * Log an anomaly record to the agentlens-anomalies DynamoDB table.
 *
 * Record format:
 *   PK: anomalyId (uuid)
 *   SK: timestamp (ISO string)
 *   rule: string (spend_spike | loop_detected | budget_warning | error_spike | concentration)
 *   agentId: string
 *   action: string (freeze | downgrade | alert)
 *   details: object (rule-specific data)
 *   resolved: boolean (default false — dashboard can mark resolved)
 */
async function logAnomaly(anomaly) {
  const record = {
    anomalyId: uuidv4(),
    timestamp: new Date().toISOString(),
    rule: anomaly.rule,
    agentId: anomaly.agentId,
    action: anomaly.action,
    details: anomaly.details,
    resolved: false,
  };

  try {
    await ddb.send(new PutCommand({
      TableName: TABLE.ANOMALIES,
      Item: record,
    }));
    console.log(`[anomaly-worker] Logged anomaly: ${anomaly.rule} for ${anomaly.agentId}`);
  } catch (err) {
    console.error(`[anomaly-worker] Failed to log anomaly:`, err.message);
  }

  return record;
}

/**
 * Send a Slack alert via webhook.
 * If SLACK_WEBHOOK_URL is not configured, logs the alert and returns.
 */
async function sendAlert(anomaly) {
  if (!SLACK_WEBHOOK_URL) {
    console.log(`[anomaly-worker] Alert (no Slack configured): ${anomaly.rule} — ${anomaly.agentId} — action: ${anomaly.action}`);
    return;
  }

  const emoji = {
    spend_spike: ":money_with_wings:",
    loop_detected: ":rotating_light:",
    budget_warning: ":warning:",
    error_spike: ":x:",
    concentration: ":bar_chart:",
  };

  const actionText = {
    freeze: ":octagonal_sign: *Auto-frozen* — agent disabled until manually re-enabled",
    downgrade: ":arrow_down: *Auto-downgraded* — routing to cheaper model",
    alert: ":bell: *Alert only* — no automatic action taken",
  };

  const detailLines = Object.entries(anomaly.details)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");

  const message = {
    text: `${emoji[anomaly.rule] || ":warning:"} *AgentLens Anomaly Detected*\n\n` +
      `*Rule*: \`${anomaly.rule}\`\n` +
      `*Agent*: \`${anomaly.agentId}\`\n` +
      `*Action*: ${actionText[anomaly.action] || anomaly.action}\n\n` +
      `\`\`\`\n${detailLines}\n\`\`\``,
  };

  return new Promise((resolve) => {
    try {
      const url = new URL(SLACK_WEBHOOK_URL);
      const postData = JSON.stringify(message);

      const req = https.request(
        {
          hostname: url.hostname,
          port: 443,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
          },
        },
        (res) => {
          res.on("data", () => {}); // drain
          res.on("end", () => {
            if (res.statusCode === 200) {
              console.log(`[anomaly-worker] Slack alert sent for ${anomaly.rule}:${anomaly.agentId}`);
            } else {
              console.error(`[anomaly-worker] Slack webhook returned ${res.statusCode}`);
            }
            resolve();
          });
        }
      );

      req.on("error", (err) => {
        console.error(`[anomaly-worker] Slack webhook error:`, err.message);
        resolve(); // never crash on alert failure
      });

      req.setTimeout(5000, () => {
        req.destroy();
        console.error(`[anomaly-worker] Slack webhook timeout`);
        resolve();
      });

      req.write(postData);
      req.end();
    } catch (err) {
      console.error(`[anomaly-worker] Slack alert error:`, err.message);
      resolve();
    }
  });
}

// --- Helpers ---

function round(n) {
  return Math.round(n * 1000000) / 1000000;
}

module.exports = { handler: exports.handler };
