/**
 * Shadow Mode — Server-side handler for shadow calls.
 *
 * When a request arrives with `x-shadow-mode: true`, it is a shadow copy
 * of a call that already went to OpenAI directly. Shadow calls:
 *
 *  1. ARE logged to DynamoDB with `shadow_mode: true`
 *  2. DO run through cache check (to measure potential savings)
 *  3. DO run through routing rules (to measure potential routing savings)
 *  4. DO NOT actually cache the response (no writes to cache table)
 *  5. DO NOT count toward budgets (no spend increment)
 *  6. DO NOT get blocked by kill switch or rate limiter
 *  7. DO NOT forward to upstream LLM (the response already happened)
 *
 * The point: accumulate 14 days of production traffic data so the dashboard
 * can show exactly how much money AgentLens would save if fully activated.
 */

const { v4: uuidv4 } = require("uuid");
const { logCall, registerAgent, getAgent, getCacheControl } = require("./dynamo");
const { estimateCost } = require("./cost");
const { getCached, buildCacheKey } = require("./cache");
const { routeModel } = require("./router");

/**
 * Check if a request is a shadow mode call.
 * @param {object} headers — normalized lowercase headers
 * @returns {boolean}
 */
function isShadowMode(headers) {
  return headers["x-shadow-mode"] === "true";
}

/**
 * Handle a shadow mode call. Does NOT forward to upstream.
 * Logs analytics data and returns 200 immediately.
 *
 * @param {object} event — the Lambda/server event
 * @returns {object} — standard response object
 */
async function handleShadowCall(event) {
  const startTime = Date.now();
  const callId = uuidv4();

  // Parse request body
  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return shadowResponse(400, {
      error: { message: "Invalid JSON body", type: "invalid_request_error" },
    });
  }

  const headers = normalizeHeaders(event.headers || {});
  const agentId = headers["x-agent-id"] || "unknown";
  const workflowId = headers["x-workflow-id"] || null;
  const customerId = headers["x-customer-id"] || null;
  const model = body.model || "gpt-4o-mini";

  // Extract the actual response data the client sent along with the shadow copy.
  // The SDK attaches it as `_shadow_response` in the body.
  const shadowResponse_ = body._shadow_response || null;
  const shadowUsage = shadowResponse_?.usage || body.usage || null;

  // Clean the body for analysis (remove shadow metadata)
  const cleanBody = { ...body };
  delete cleanBody._shadow_response;
  delete cleanBody.usage;

  // --- Shadow Analysis 1: Cache Check ---
  // Would this call have been a cache hit? (measures potential cache savings)
  let wouldHaveCached = false;
  let potentialCacheSavings = 0;

  try {
    const cacheControl = await getCacheControl(agentId);
    if (cacheControl.enabled && cleanBody.messages && !cleanBody.stream) {
      const cached = await getCached(model, cleanBody.messages, cacheControl.ttlHours);
      if (cached) {
        wouldHaveCached = true;
        if (shadowUsage) {
          potentialCacheSavings = estimateCost(model, shadowUsage).totalCost;
        }
      }
    }
  } catch {
    // Fail silently — shadow analysis is best-effort
  }

  // --- Shadow Analysis 2: Routing Check ---
  // Would the router have picked a cheaper model?
  let routingAnalysis = { routed: false, rule: null, targetModel: null };
  let potentialRoutingSavings = 0;

  try {
    const routing = routeModel(cleanBody);
    if (routing.routed) {
      routingAnalysis = {
        routed: true,
        rule: routing.rule,
        targetModel: routing.model,
        originalModel: routing.originalModel,
      };
      // Calculate what the cheaper model would have cost
      if (shadowUsage) {
        const originalCost = estimateCost(model, shadowUsage).totalCost;
        const routedCost = estimateCost(routing.model, shadowUsage).totalCost;
        potentialRoutingSavings = Math.max(0, originalCost - routedCost);
      }
    }
  } catch {
    // Fail silently
  }

  // --- Compute actual cost from usage ---
  let cost = { inputCost: 0, outputCost: 0, totalCost: 0 };
  if (shadowUsage) {
    cost = estimateCost(model, shadowUsage);
  }

  // --- Log the shadow call ---
  try {
    await logCall({
      callId,
      agentId,
      model,
      status: "shadow",
      shadow_mode: true,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      inputTokens: shadowUsage?.prompt_tokens || 0,
      outputTokens: shadowUsage?.completion_tokens || 0,
      totalTokens: shadowUsage?.total_tokens || 0,
      inputCost: cost.inputCost,
      outputCost: cost.outputCost,
      totalCost: cost.totalCost,
      // Shadow-specific analytics
      wouldHaveCached,
      potentialCacheSavings,
      potentialRoutingSavings,
      routingAnalysis: routingAnalysis.routed ? routingAnalysis : undefined,
      // Metadata
      workflowId,
      customerId,
      cached: false,
      routed: false, // Shadow calls don't actually route
      streamed: cleanBody.stream === true,
    });
  } catch (err) {
    // Log failure should never surface to client
    console.error("[shadow] Failed to log call:", err.message);
  }

  // --- Auto-register agent if new ---
  try {
    const existingAgent = await getAgent(agentId);
    if (!existingAgent && agentId !== "unknown") {
      await registerAgent(agentId, { model, shadow: true });
    }
  } catch {
    // Silently swallow
  }

  // Return immediately — the shadow call is logged, nothing else to do
  return shadowResponse(200, {
    status: "shadow_logged",
    callId,
    shadow_mode: true,
    analysis: {
      wouldHaveCached,
      potentialCacheSavings,
      potentialRoutingSavings,
      routedModel: routingAnalysis.routed ? routingAnalysis.targetModel : null,
      routingRule: routingAnalysis.rule,
    },
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

function shadowResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, x-agent-id, x-workflow-id, x-prompt-version, x-cache, x-shadow-mode, x-customer-id",
    },
    body: JSON.stringify(body),
  };
}

module.exports = { isShadowMode, handleShadowCall };
