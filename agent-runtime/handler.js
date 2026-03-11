/**
 * AgentLens Agent Runtime — Lambda Entry Point Template
 *
 * Reads agentlens-agent.json, sets up proxy connection, initializes memory,
 * runs agent logic with checkpoint wrapping, and handles crash recovery.
 *
 * Copy this file into your agent project and implement the `steps` array
 * with your business logic.
 *
 * @module agent-runtime/handler
 */

const { v4: uuidv4 } = require("uuid");
const OpenAI = require("openai");
const { loadCheckpoint, saveCheckpoint, withCheckpoint } = require("./checkpoint");
const { injectMemories, saveMemory, clearShortTerm } = require("./memory");

/** @type {string} */
const AGENT_CONFIG_PATH = process.env.AGENT_CONFIG_PATH || "./agentlens-agent.json";

/**
 * Load and validate the agent configuration file.
 * @returns {object} Parsed agent config
 * @throws {Error} If config is missing or invalid
 */
function loadAgentConfig() {
  let config;
  try {
    config = require(AGENT_CONFIG_PATH);
  } catch (err) {
    throw new Error(`Failed to load agent config from ${AGENT_CONFIG_PATH}: ${err.message}`);
  }

  // Validate required fields
  const required = ["name", "version", "entryPoint", "budget", "checkpoint", "proxy"];
  for (const field of required) {
    if (!config[field]) {
      throw new Error(`agentlens-agent.json missing required field: ${field}`);
    }
  }

  if (!config.proxy.enabled) {
    throw new Error("proxy.enabled must be true — all LLM calls must route through AgentLens proxy");
  }

  if (!config.checkpoint.enabled) {
    throw new Error("checkpoint.enabled must be true — crash recovery is mandatory");
  }

  return config;
}

/**
 * Initialize the OpenAI client wired through the AgentLens proxy.
 * @param {object} config - Agent config
 * @returns {OpenAI} Configured OpenAI client
 */
function initProxyClient(config) {
  const proxyUrl = process.env.AGENTLENS_PROXY_URL;
  if (!proxyUrl) {
    throw new Error("AGENTLENS_PROXY_URL environment variable is required");
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: `${proxyUrl.replace(/\/$/, "")}/v1`,
    defaultHeaders: {
      "x-agent-id": config.proxy.agentId,
    },
  });
}

/**
 * Make an LLM call with automatic fallback on failure.
 * Uses primary model first, falls back to cheaper model on error.
 *
 * @param {OpenAI} client - OpenAI client (proxy-wired)
 * @param {object} budget - Budget config from agentlens-agent.json
 * @param {object} params - OpenAI chat completion params (messages, etc.)
 * @returns {object} Chat completion response
 */
async function llmCall(client, budget, params) {
  const { primaryModel, fallbackModel } = budget;

  // Try primary model
  try {
    const response = await client.chat.completions.create({
      ...params,
      model: primaryModel,
    });
    return response;
  } catch (primaryErr) {
    const retryableCodes = [429, 500, 502, 503];
    const statusCode = primaryErr.status || primaryErr.statusCode;

    if (retryableCodes.includes(statusCode) || primaryErr.code === "ETIMEDOUT") {
      console.warn(
        `[agent] Primary model ${primaryModel} failed (${statusCode || primaryErr.code}), falling back to ${fallbackModel}`
      );

      try {
        const response = await client.chat.completions.create({
          ...params,
          model: fallbackModel,
        });
        return response;
      } catch (fallbackErr) {
        console.error(`[agent] Fallback model ${fallbackModel} also failed: ${fallbackErr.message}`);
        throw fallbackErr;
      }
    }

    throw primaryErr;
  }
}

/**
 * Lambda handler — entry point for every agent run.
 *
 * Flow:
 * 1. Load config
 * 2. Generate run ID
 * 3. Check for existing checkpoint (crash recovery)
 * 4. Inject long-term memories
 * 5. Execute steps with checkpoint wrapping
 * 6. Clear short-term memory
 * 7. Return result
 *
 * @param {object} event - Lambda event (cron, webhook payload, or manual trigger)
 * @param {object} context - Lambda context
 * @returns {object} Execution result
 */
async function handler(event, context) {
  const runId = uuidv4();
  const startTime = Date.now();
  let config;
  let client;

  // --- Load Config ---
  try {
    config = loadAgentConfig();
  } catch (err) {
    console.error(`[agent] Config load failed: ${err.message}`);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Agent config invalid", detail: err.message }),
    };
  }

  const agentId = config.proxy.agentId;
  console.log(`[agent:${agentId}] Run ${runId} starting — v${config.version}`);

  // --- Init Proxy Client ---
  try {
    client = initProxyClient(config);
  } catch (err) {
    console.error(`[agent:${agentId}] Proxy client init failed: ${err.message}`);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Proxy init failed", detail: err.message }),
    };
  }

  // --- Crash Recovery: Check for existing checkpoint ---
  let lastCheckpoint = null;
  try {
    lastCheckpoint = await loadCheckpoint(agentId, runId);
    if (lastCheckpoint) {
      console.log(
        `[agent:${agentId}] Resuming from checkpoint: step="${lastCheckpoint.stepName}", ` +
        `completed at ${lastCheckpoint.completedAt}`
      );
    }
  } catch (err) {
    console.warn(`[agent:${agentId}] Checkpoint load failed (starting fresh): ${err.message}`);
  }

  // --- Inject Long-Term Memories ---
  let memories = [];
  try {
    if (config.memory?.longTerm) {
      memories = await injectMemories(agentId);
      console.log(`[agent:${agentId}] Injected ${memories.length} long-term memories`);
    }
  } catch (err) {
    console.warn(`[agent:${agentId}] Memory injection failed (continuing without): ${err.message}`);
  }

  // --- Execute Agent Steps ---
  //
  // IMPORTANT: Replace this section with your actual agent logic.
  // Each step should be wrapped with withCheckpoint() for crash recovery.
  //
  // Example:
  //
  //   const steps = [
  //     { name: "fetch-deals", fn: async (ctx) => { ... } },
  //     { name: "analyze-deals", fn: async (ctx) => { ... } },
  //     { name: "send-summary", fn: async (ctx) => { ... } },
  //   ];
  //

  const steps = getAgentSteps(config, client, memories);
  const completedSteps = lastCheckpoint?.completedSteps || [];
  const results = {};

  for (const step of steps) {
    // Skip already-completed steps (crash recovery)
    if (completedSteps.includes(step.name)) {
      console.log(`[agent:${agentId}] Skipping completed step: ${step.name}`);
      continue;
    }

    try {
      console.log(`[agent:${agentId}] Executing step: ${step.name}`);
      const stepResult = await withCheckpoint(
        agentId,
        runId,
        step.name,
        completedSteps,
        () => step.fn({ config, client, memories, results, llmCall: (params) => llmCall(client, config.budget, params) }),
        {
          strategy: config.checkpoint.retryStrategy,
          maxRetries: config.checkpoint.maxRetries,
        }
      );
      results[step.name] = stepResult;
      completedSteps.push(step.name);
    } catch (err) {
      console.error(`[agent:${agentId}] Step "${step.name}" failed after retries: ${err.message}`);

      // Save failure state for debugging
      try {
        await saveCheckpoint(agentId, runId, step.name, {
          status: "failed",
          error: err.message,
          completedSteps,
          failedAt: new Date().toISOString(),
        });
      } catch (cpErr) {
        console.error(`[agent:${agentId}] Failed to save failure checkpoint: ${cpErr.message}`);
      }

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: `Agent failed at step: ${step.name}`,
          detail: err.message,
          runId,
          completedSteps,
        }),
      };
    }
  }

  // --- Clear Short-Term Memory ---
  try {
    if (config.memory?.shortTerm) {
      await clearShortTerm(agentId, runId);
    }
  } catch (err) {
    console.warn(`[agent:${agentId}] Short-term memory cleanup failed: ${err.message}`);
  }

  const durationMs = Date.now() - startTime;
  console.log(`[agent:${agentId}] Run ${runId} complete in ${durationMs}ms — ${completedSteps.length} steps`);

  return {
    statusCode: 200,
    body: JSON.stringify({
      agentId,
      runId,
      version: config.version,
      completedSteps,
      durationMs,
      results,
    }),
  };
}

/**
 * Define agent steps here. Replace this with your actual business logic.
 * Each step must be idempotent (safe to re-run on crash recovery).
 *
 * @param {object} config - Agent config
 * @param {OpenAI} client - Proxy-wired OpenAI client
 * @param {Array} memories - Injected long-term memories
 * @returns {Array<{name: string, fn: Function}>} Ordered list of steps
 */
function getAgentSteps(config, client, memories) {
  // --- TEMPLATE: Replace with your agent's actual steps ---
  return [
    {
      name: "initialize",
      fn: async (ctx) => {
        console.log(`[agent:${config.proxy.agentId}] Initialize step — agent v${config.version}`);
        return { initialized: true, memoryCount: memories.length };
      },
    },
    // Add your steps here:
    // {
    //   name: "fetch-data",
    //   fn: async (ctx) => {
    //     const response = await ctx.llmCall({
    //       messages: [{ role: "user", content: "Analyze this data..." }],
    //     });
    //     return { analysis: response.choices[0].message.content };
    //   },
    // },
  ];
}

module.exports = { handler, loadAgentConfig, initProxyClient, llmCall };
