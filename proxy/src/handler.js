const https = require("https");
const { v4: uuidv4 } = require("uuid");
const { isKilled, checkBudget, incrementSpend, logCall, registerAgent, getAgent, getCacheControl } = require("./dynamo");
const { estimateCost } = require("./cost");
const { getCached, putCache } = require("./cache");
const { routeModel } = require("./router");
const { getStats } = require("./stats");
const { checkRate, setLimit, getLimit, getStatus } = require("./rate-limiter");
const { trackVersion, getVersions, rollbackTo, updateMetrics } = require("./prompt-versions");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const UPSTREAM_BASE = process.env.UPSTREAM_BASE || "https://api.openai.com";

function parseAgentHeaders(headers) {
  return {
    agentId: headers["x-agent-id"] || "unknown",
    workflowId: headers["x-workflow-id"] || null,
    promptVersion: headers["x-prompt-version"] || null,
  };
}

function forwardToOpenAI(path, body, apiKey) {
  return new Promise((resolve, reject) => {
    const base = new URL(UPSTREAM_BASE);
    const fullPath = base.pathname.replace(/\/$/, "") + path;
    const postData = JSON.stringify(body);

    const req = https.request(
      {
        hostname: base.hostname,
        port: 443,
        path: fullPath,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey || OPENAI_API_KEY}`,
          "Content-Length": Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ statusCode: res.statusCode, body: data });
          }
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("Upstream timeout"));
    });
    req.write(postData);
    req.end();
  });
}

/**
 * Stream a request to OpenAI and pipe SSE chunks back.
 * Buffers the full response for async logging after stream ends.
 */
function forwardStreamToOpenAI(path, body, apiKey) {
  return new Promise((resolve, reject) => {
    const base = new URL(UPSTREAM_BASE);
    const fullPath = base.pathname.replace(/\/$/, "") + path;
    const postData = JSON.stringify(body);

    const req = https.request(
      {
        hostname: base.hostname,
        port: 443,
        path: fullPath,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey || OPENAI_API_KEY}`,
          "Content-Length": Buffer.byteLength(postData),
        },
      },
      (upstreamRes) => {
        resolve({
          statusCode: upstreamRes.statusCode,
          headers: upstreamRes.headers,
          stream: upstreamRes,
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error("Upstream stream timeout"));
    });
    req.write(postData);
    req.end();
  });
}

async function handleChatCompletion(event) {
  const startTime = Date.now();
  const callId = uuidv4();

  // Parse request
  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return response(400, { error: { message: "Invalid JSON body", type: "invalid_request_error" } });
  }

  const headers = normalizeHeaders(event.headers || {});
  const { agentId, workflowId, promptVersion } = parseAgentHeaders(headers);
  const model = body.model || "gpt-4o-mini";
  const isStreaming = body.stream === true;

  // --- Check 1: Kill Switch ---
  const killed = await isKilled(agentId);
  if (killed) {
    await logCall({
      callId,
      agentId,
      model,
      status: "killed",
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      workflowId,
    });
    return response(403, {
      error: {
        message: `Agent '${agentId}' is currently disabled via AgentLens kill switch.`,
        type: "agent_killed",
        code: "agent_disabled",
      },
    });
  }

  // --- Check 2: Rate Limit ---
  const rateResult = checkRate(agentId);
  if (!rateResult.allowed) {
    await logCall({
      callId,
      agentId,
      model,
      status: "rate_limited",
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      workflowId,
      rateLimit: rateResult.limit,
      rateCurrent: rateResult.current,
    });
    return response(429, {
      error: {
        message: `Agent '${agentId}' rate limited: ${rateResult.current}/${rateResult.limit} RPM. Retry in ${Math.ceil(rateResult.retryAfterMs / 1000)}s.`,
        type: "rate_limited",
        code: "rate_limit_exceeded",
      },
      _agentlens: { retryAfterMs: rateResult.retryAfterMs },
    });
  }

  // --- Check 3: Budget ---
  const budget = await checkBudget(agentId);
  if (!budget.allowed) {
    await logCall({
      callId,
      agentId,
      model,
      status: "budget_exceeded",
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      budgetSpent: budget.spent,
      budgetLimit: budget.limit,
      workflowId,
    });
    return response(429, {
      error: {
        message: `Agent '${agentId}' has exceeded its monthly budget ($${budget.spent.toFixed(2)} / $${budget.limit.toFixed(2)}).`,
        type: "budget_exceeded",
        code: "budget_limit",
      },
    });
  }

  // --- Check 4: Cache ---
  const cacheSkip = headers["x-cache"] === "skip";
  let cacheControl = { enabled: true, ttlHours: null };
  if (!isStreaming && !cacheSkip) {
    cacheControl = await getCacheControl(agentId);
    if (cacheControl.enabled) {
      const cached = await getCached(model, body.messages, cacheControl.ttlHours);
      if (cached) {
        const cachedCost = estimateCost(model, cached.usage);
        await logCall({
          callId,
          agentId,
          model,
          status: "cache_hit",
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
          inputTokens: cached.usage.prompt_tokens || 0,
          outputTokens: cached.usage.completion_tokens || 0,
          totalTokens: cached.usage.total_tokens || 0,
          savedCost: cachedCost.totalCost,
          cached: true,
          workflowId,
          promptVersion,
        });
        return response(200, cached.response);
      }
    }
  }

  // --- Check 5: Model Router ---
  const routing = routeModel(body);
  const routedModel = routing.model;
  if (routing.routed) {
    console.log(`[router] ${routing.savings}`);
  }

  // --- Track prompt version (async, don't block) ---
  const systemPrompt = body.messages?.find(m => m.role === "system")?.content;
  if (promptVersion && systemPrompt) {
    trackVersion(agentId, promptVersion, systemPrompt).catch(() => {});
  }

  // --- Check 6: Forward to OpenAI ---
  // Streaming path — pipe SSE chunks through, log async after stream ends
  if (isStreaming) {
    return handleStreamingForward(event, {
      callId, agentId, model, routedModel, routing, body, headers, workflowId, promptVersion, startTime,
    });
  }

  // Non-streaming path
  const forwardBody = { ...body, model: routedModel };
  let upstream;
  try {
    upstream = await forwardToOpenAI("/v1/chat/completions", forwardBody, headers["authorization"]?.replace("Bearer ", ""));
  } catch (err) {
    await logCall({
      callId,
      agentId,
      model: routedModel,
      status: "upstream_error",
      error: err.message,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      workflowId,
    });
    return response(502, {
      error: { message: "Upstream LLM provider error", type: "upstream_error" },
    });
  }

  const latencyMs = Date.now() - startTime;

  // Calculate cost from usage
  let cost = { inputCost: 0, outputCost: 0, totalCost: 0 };
  if (upstream.body?.usage) {
    cost = estimateCost(routedModel, upstream.body.usage);
  }

  // Increment spend
  if (cost.totalCost > 0) {
    await incrementSpend(agentId, cost.totalCost);
  }

  // Write to cache (only successful non-streaming responses, respecting per-agent controls)
  if (upstream.statusCode === 200 && upstream.body?.usage && cacheControl.enabled && !cacheSkip) {
    await putCache(model, body.messages, upstream.body, upstream.body.usage, cacheControl.ttlHours);
  }

  // Auto-register agent if new
  const existingAgent = await getAgent(agentId);
  if (!existingAgent && agentId !== "unknown") {
    await registerAgent(agentId, { model: routedModel });
  }

  // Update prompt version metrics
  if (promptVersion) {
    updateMetrics(agentId, promptVersion, latencyMs, upstream.statusCode === 200).catch(() => {});
  }

  // Log call
  await logCall({
    callId,
    agentId,
    model: routedModel,
    requestedModel: model,
    status: "success",
    timestamp: new Date().toISOString(),
    latencyMs,
    inputTokens: upstream.body?.usage?.prompt_tokens || 0,
    outputTokens: upstream.body?.usage?.completion_tokens || 0,
    totalTokens: upstream.body?.usage?.total_tokens || 0,
    inputCost: cost.inputCost,
    outputCost: cost.outputCost,
    totalCost: cost.totalCost,
    cached: false,
    routed: routing.routed,
    routingRule: routing.rule,
    originalModel: routing.routed ? routing.originalModel : undefined,
    workflowId,
    promptVersion,
  });

  // Return identical OpenAI response
  return response(upstream.statusCode, upstream.body);
}

/**
 * Handle streaming request — returns a special "stream" response
 * that the server.js knows how to pipe to the client.
 * Buffers chunks for async cost logging after stream ends.
 */
async function handleStreamingForward(event, ctx) {
  const { callId, agentId, model, routedModel, routing, body, headers, workflowId, promptVersion, startTime } = ctx;

  const forwardBody = { ...body, model: routedModel, stream: true };
  let upstreamStream;
  try {
    upstreamStream = await forwardStreamToOpenAI(
      "/v1/chat/completions",
      forwardBody,
      headers["authorization"]?.replace("Bearer ", "")
    );
  } catch (err) {
    await logCall({
      callId, agentId, model: routedModel, status: "upstream_error",
      error: err.message, timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startTime, workflowId,
    });
    return response(502, {
      error: { message: "Upstream LLM provider error", type: "upstream_error" },
    });
  }

  // Return a special streaming response — server.js handles the pipe
  return {
    statusCode: upstreamStream.statusCode,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-agent-id, x-workflow-id, x-prompt-version, x-cache",
    },
    isStream: true,
    stream: upstreamStream.stream,
    // Called after stream ends — async log
    onStreamEnd: async (chunks) => {
      const latencyMs = Date.now() - startTime;
      // Parse the final chunk for usage info
      let usage = null;
      let fullContent = "";
      for (const chunk of chunks) {
        try {
          const lines = chunk.split("\n").filter(l => l.startsWith("data: ") && l !== "data: [DONE]");
          for (const line of lines) {
            const json = JSON.parse(line.replace("data: ", ""));
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) fullContent += delta;
            if (json.usage) usage = json.usage;
          }
        } catch {
          // not every chunk is JSON
        }
      }

      let cost = { inputCost: 0, outputCost: 0, totalCost: 0 };
      if (usage) {
        cost = estimateCost(routedModel, usage);
        if (cost.totalCost > 0) {
          incrementSpend(agentId, cost.totalCost).catch(() => {});
        }
      }

      if (promptVersion) {
        updateMetrics(agentId, promptVersion, latencyMs, true).catch(() => {});
      }

      logCall({
        callId, agentId, model: routedModel, requestedModel: model,
        status: "success", timestamp: new Date().toISOString(), latencyMs,
        inputTokens: usage?.prompt_tokens || 0,
        outputTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
        inputCost: cost.inputCost, outputCost: cost.outputCost, totalCost: cost.totalCost,
        cached: false, routed: routing.routed, routingRule: routing.rule,
        originalModel: routing.routed ? routing.originalModel : undefined,
        workflowId, promptVersion, streamed: true,
      }).catch(() => {});
    },
  };
}

// --- Lambda Handler ---

async function handler(event) {
  const method = event.httpMethod || event.requestContext?.http?.method || "POST";
  const path = event.path || event.rawPath || "/";

  // Health check
  if (path === "/health" || path === "/") {
    return response(200, {
      status: "ok",
      service: "agentlens-proxy",
      version: "2.0.0",
      timestamp: new Date().toISOString(),
    });
  }

  // OpenAI-compatible chat completions endpoint
  if (path === "/v1/chat/completions" && method === "POST") {
    return handleChatCompletion(event);
  }

  // Stats endpoint (for dashboard)
  if (path === "/api/stats" && method === "GET") {
    const stats = await getStats();
    return response(200, stats);
  }

  // Controls endpoint (kill switch)
  if (path === "/api/controls" && method === "POST") {
    let body;
    try {
      body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch {
      return response(400, { error: { message: "Invalid JSON" } });
    }
    const { PutCommand } = require("@aws-sdk/lib-dynamodb");
    const { ddb, TABLE } = require("./dynamo");
    await ddb.send(new PutCommand({
      TableName: TABLE.CONTROLS,
      Item: { agentId: body.agentId, killed: body.killed, updatedAt: new Date().toISOString() },
    }));
    return response(200, { ok: true, agentId: body.agentId, killed: body.killed });
  }

  // Cache controls endpoint (per-agent cache on/off + TTL)
  if (path === "/api/cache-controls" && method === "POST") {
    let body;
    try {
      body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch {
      return response(400, { error: { message: "Invalid JSON" } });
    }
    const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
    const { ddb, TABLE } = require("./dynamo");
    await ddb.send(new UpdateCommand({
      TableName: TABLE.CONTROLS,
      Key: { agentId: body.agentId },
      UpdateExpression: "SET cacheEnabled = :enabled, cacheTTL = :ttl, updatedAt = :now",
      ExpressionAttributeValues: {
        ":enabled": body.cacheEnabled !== false,
        ":ttl": body.cacheTTL != null ? body.cacheTTL : null,
        ":now": new Date().toISOString(),
      },
    }));
    return response(200, { ok: true, agentId: body.agentId, cacheEnabled: body.cacheEnabled !== false, cacheTTL: body.cacheTTL || null });
  }

  // Budgets endpoint
  if (path === "/api/budgets" && method === "POST") {
    let body;
    try {
      body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch {
      return response(400, { error: { message: "Invalid JSON" } });
    }
    const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
    const { ddb, TABLE } = require("./dynamo");
    await ddb.send(new UpdateCommand({
      TableName: TABLE.BUDGETS,
      Key: { agentId: body.agentId },
      UpdateExpression: "SET monthlyLimit = :limit, updatedAt = :now",
      ExpressionAttributeValues: { ":limit": body.monthlyLimit, ":now": new Date().toISOString() },
    }));
    return response(200, { ok: true, agentId: body.agentId, monthlyLimit: body.monthlyLimit });
  }

  // Rate limit config endpoint
  if (path === "/api/rate-limits" && method === "POST") {
    let body;
    try {
      body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch {
      return response(400, { error: { message: "Invalid JSON" } });
    }
    setLimit(body.agentId, body.rpm);
    return response(200, { ok: true, agentId: body.agentId, rpm: body.rpm });
  }

  // Rate limit status endpoint
  if (path === "/api/rate-limits" && method === "GET") {
    const allAgents = (await getStats()).agents || [];
    const statuses = allAgents.map(a => ({
      agentId: a.agentId,
      ...getStatus(a.agentId),
    }));
    return response(200, { rateLimits: statuses });
  }

  // Prompt versions endpoints
  if (path.startsWith("/api/versions") && method === "GET") {
    const agentId = path.split("/")[3]; // /api/versions/:agentId
    if (!agentId) {
      return response(400, { error: { message: "agentId required: /api/versions/:agentId" } });
    }
    const versions = await getVersions(agentId);
    return response(200, { agentId, versions });
  }

  if (path === "/api/versions/rollback" && method === "POST") {
    let body;
    try {
      body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch {
      return response(400, { error: { message: "Invalid JSON" } });
    }
    const result = await rollbackTo(body.agentId, body.version);
    return response(result.ok ? 200 : 500, result);
  }

  // Models endpoint (passthrough)
  if (path === "/v1/models" && method === "GET") {
    try {
      const res = await forwardToOpenAI("/v1/models", null);
      return response(res.statusCode, res.body);
    } catch {
      return response(502, { error: { message: "Failed to fetch models" } });
    }
  }

  return response(404, {
    error: { message: `Not found: ${method} ${path}`, type: "not_found" },
  });
}

// --- Helpers ---

function normalizeHeaders(headers) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-agent-id, x-workflow-id, x-prompt-version, x-cache",
    },
    body: JSON.stringify(body),
  };
}

module.exports = { handler };
