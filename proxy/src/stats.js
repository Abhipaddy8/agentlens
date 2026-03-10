const { ddb, TABLE } = require("./dynamo");
const { ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { getStatus } = require("./rate-limiter");

async function getStats() {
  try {
    // Scan calls table for aggregate stats
    const res = await ddb.send(new ScanCommand({
      TableName: TABLE.CALLS,
      ProjectionExpression: "agentId, #s, totalCost, savedCost, cached, routed, routingRule, latencyMs, #ts, workflowId, promptVersion, streamed, requestedModel, originalModel, #m, inputTokens, outputTokens",
      ExpressionAttributeNames: { "#s": "status", "#ts": "timestamp", "#m": "model" },
    }));

    const items = res.Items || [];
    const agents = {};
    const workflows = {};
    const routingRules = {};
    let totalCost = 0;
    let totalSaved = 0;
    let cacheHits = 0;
    let routedCalls = 0;
    let totalCalls = items.length;
    let killedCalls = 0;
    let budgetBlocked = 0;
    let rateLimited = 0;
    let streamedCalls = 0;
    let totalRoutingSaved = 0;

    // Aggregators for global cache latency
    let cachedLatencySum = 0;
    let cachedLatencyCount = 0;
    let uncachedLatencySum = 0;
    let uncachedLatencyCount = 0;

    for (const item of items) {
      // Per-agent stats
      if (!agents[item.agentId]) {
        agents[item.agentId] = {
          agentId: item.agentId,
          calls: 0,
          cost: 0,
          saved: 0,
          cacheHits: 0,
          routed: 0,
          killed: 0,
          budgetBlocked: 0,
          rateLimited: 0,
          streamed: 0,
          // Cache latency tracking
          _cachedLatencySum: 0,
          _cachedLatencyCount: 0,
          _uncachedLatencySum: 0,
          _uncachedLatencyCount: 0,
          // Routing tracking
          _routingRuleCounts: {},
          _requestedModels: {},
          _actualModels: {},
          routingSaved: 0,
        };
      }
      const agent = agents[item.agentId];
      agent.calls++;

      // Workflow grouping
      if (item.workflowId) {
        if (!workflows[item.workflowId]) {
          workflows[item.workflowId] = {
            workflowId: item.workflowId,
            calls: 0,
            cost: 0,
            agents: new Set(),
            firstSeen: item.timestamp,
            lastSeen: item.timestamp,
          };
        }
        const wf = workflows[item.workflowId];
        wf.calls++;
        wf.agents.add(item.agentId);
        if (item.timestamp < wf.firstSeen) wf.firstSeen = item.timestamp;
        if (item.timestamp > wf.lastSeen) wf.lastSeen = item.timestamp;
      }

      // Track requested/actual models for agent
      if (item.requestedModel) {
        agent._requestedModels[item.requestedModel] = (agent._requestedModels[item.requestedModel] || 0) + 1;
      }

      if (item.status === "success") {
        const callCost = item.totalCost || 0;
        totalCost += callCost;
        agent.cost += callCost;
        if (item.workflowId && workflows[item.workflowId]) {
          workflows[item.workflowId].cost += callCost;
        }

        // Track uncached latency
        if (item.latencyMs) {
          uncachedLatencySum += item.latencyMs;
          uncachedLatencyCount++;
          agent._uncachedLatencySum += item.latencyMs;
          agent._uncachedLatencyCount++;
        }

        if (item.routed) {
          routedCalls++;
          agent.routed++;

          // Track routing rules
          const rule = item.routingRule || "unknown";
          const from = item.originalModel || item.requestedModel || "unknown";
          const to = item.model || "unknown";
          if (!routingRules[rule]) {
            routingRules[rule] = { rule, count: 0, from, to, saved: 0 };
          }
          routingRules[rule].count++;

          // Estimate routing savings
          const routingSaved = estimateRoutingSavings(from, to, callCost);
          routingRules[rule].saved += routingSaved;
          totalRoutingSaved += routingSaved;
          agent.routingSaved += routingSaved;

          // Track routing rule per agent
          agent._routingRuleCounts[rule] = (agent._routingRuleCounts[rule] || 0) + 1;
          agent._actualModels[item.model || "unknown"] = (agent._actualModels[item.model || "unknown"] || 0) + 1;
        } else {
          // Non-routed: actual model = the model field
          const model = item.model || item.requestedModel || "unknown";
          agent._actualModels[model] = (agent._actualModels[model] || 0) + 1;
        }

        if (item.streamed) {
          streamedCalls++;
          agent.streamed++;
        }
      } else if (item.status === "cache_hit") {
        cacheHits++;
        agent.cacheHits++;
        totalSaved += item.savedCost || 0;
        agent.saved += item.savedCost || 0;

        // Track cached latency
        if (item.latencyMs) {
          cachedLatencySum += item.latencyMs;
          cachedLatencyCount++;
          agent._cachedLatencySum += item.latencyMs;
          agent._cachedLatencyCount++;
        }
      } else if (item.status === "killed") {
        killedCalls++;
        agent.killed++;
      } else if (item.status === "budget_exceeded") {
        budgetBlocked++;
        agent.budgetBlocked++;
      } else if (item.status === "rate_limited") {
        rateLimited++;
        agent.rateLimited++;
      }
    }

    // Compute global cache latency averages
    const avgCachedLatency = cachedLatencyCount > 0 ? cachedLatencySum / cachedLatencyCount : 0;
    const avgUncachedLatency = uncachedLatencyCount > 0 ? uncachedLatencySum / uncachedLatencyCount : 0;

    // Build per-agent cache and routing stats
    const agentCacheStats = [];
    const agentRoutingStats = [];

    // Add rate limit status and enriched metrics to each agent
    const agentList = Object.values(agents).map(a => {
      const agentAvgCached = a._cachedLatencyCount > 0 ? a._cachedLatencySum / a._cachedLatencyCount : 0;
      const agentAvgUncached = a._uncachedLatencyCount > 0 ? a._uncachedLatencySum / a._uncachedLatencyCount : 0;
      const cacheHitRate = a.calls > 0 ? round(a.cacheHits / a.calls * 100) : 0;
      const topRoutingRule = mostCommonKey(a._routingRuleCounts);
      const requestedModel = mostCommonKey(a._requestedModels);
      const actualModel = mostCommonKey(a._actualModels);

      // Collect per-agent cache stats
      if (a.cacheHits > 0) {
        agentCacheStats.push({
          agentId: a.agentId,
          hits: a.cacheHits,
          hitRate: cacheHitRate,
          saved: round(a.saved),
          avgCachedMs: round(agentAvgCached),
          avgUncachedMs: round(agentAvgUncached),
        });
      }

      // Collect per-agent routing stats
      if (a.routed > 0) {
        agentRoutingStats.push({
          agentId: a.agentId,
          routedCount: a.routed,
          requestedModel: requestedModel || "unknown",
          actualModel: actualModel || "unknown",
          saved: round(a.routingSaved),
        });
      }

      // Clean up internal tracking fields
      const { _cachedLatencySum, _cachedLatencyCount, _uncachedLatencySum, _uncachedLatencyCount,
              _routingRuleCounts, _requestedModels, _actualModels, routingSaved, ...clean } = a;

      return {
        ...clean,
        cacheHitRate,
        avgCachedLatency: round(agentAvgCached),
        avgUncachedLatency: round(agentAvgUncached),
        routingRule: topRoutingRule,
        requestedModel: requestedModel || "unknown",
        actualModel: actualModel || "unknown",
        rateLimit: getStatus(a.agentId),
      };
    });

    // Convert workflow Sets to arrays and sort by cost
    const workflowList = Object.values(workflows)
      .map(wf => ({
        ...wf,
        agents: [...wf.agents],
        agentCount: wf.agents.size,
      }))
      .sort((a, b) => b.cost - a.cost);

    return {
      overview: {
        totalCalls,
        totalCost: round(totalCost),
        totalSaved: round(totalSaved),
        cacheHitRate: totalCalls > 0 ? round(cacheHits / totalCalls * 100) : 0,
        routedCalls,
        routingSaved: round(totalRoutingSaved),
        killedCalls,
        budgetBlocked,
        rateLimited,
        streamedCalls,
      },
      agents: agentList.sort((a, b) => b.cost - a.cost),
      workflows: workflowList,
      cache: {
        totalHits: cacheHits,
        totalSaved: round(totalSaved),
        avgCachedLatencyMs: round(avgCachedLatency),
        avgUncachedLatencyMs: round(avgUncachedLatency),
        speedup: round(avgUncachedLatency / Math.max(avgCachedLatency, 1)),
        perAgent: agentCacheStats,
      },
      routing: {
        totalRouted: routedCalls,
        totalSaved: round(totalRoutingSaved),
        rules: Object.values(routingRules),
        perAgent: agentRoutingStats,
      },
    };
  } catch (err) {
    console.error("Stats query failed:", err.message);
    return { overview: {}, agents: [], workflows: [], cache: {}, routing: {} };
  }
}

function round(n) {
  return Math.round(n * 1000000) / 1000000;
}

// Estimate savings from model routing (e.g. gpt-4o -> gpt-4o-mini is ~90% cheaper)
function estimateRoutingSavings(fromModel, toModel, callCost) {
  if (!fromModel || !toModel || fromModel === toModel) return 0;
  const from = (fromModel || "").toLowerCase();
  const to = (toModel || "").toLowerCase();
  // gpt-4o to gpt-4o-mini: mini is ~10x cheaper, so savings ~90%
  if (from.includes("gpt-4o") && !from.includes("mini") && to.includes("mini")) {
    return callCost * 9; // what it would have cost minus what it did cost
  }
  // gpt-4 to gpt-3.5: ~20x cheaper
  if (from.includes("gpt-4") && to.includes("gpt-3.5")) {
    return callCost * 19;
  }
  // Default heuristic: assume routing saves ~50%
  return callCost;
}

// Return the key with the highest count in an object, or null
function mostCommonKey(obj) {
  let best = null;
  let bestCount = 0;
  for (const [key, count] of Object.entries(obj)) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

module.exports = { getStats };
