/**
 * AgentLens Agent Runtime — Crash Recovery Module
 *
 * Provides checkpoint save/load, retry with exponential backoff,
 * and reconciliation on restart. Inspired by TechStack Tetris 3-5
 * pattern: checkpoint writer, state store, failure detector, retry
 * handler, reconciliation validator.
 *
 * Storage: DynamoDB table `agentlens-agent-sessions`
 *
 * @module agent-runtime/checkpoint
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const ddb = DynamoDBDocumentClient.from(ddbClient);

const CHECKPOINT_TABLE = process.env.CHECKPOINT_TABLE || "agentlens-agent-sessions";

/**
 * Save a checkpoint after a successful step.
 * Writes the current state to DynamoDB so the agent can resume from here on crash.
 *
 * @param {string} agentId - Agent identifier
 * @param {string} runId - Current run identifier
 * @param {string} stepName - Name of the completed step
 * @param {object} state - Arbitrary state to persist (must be JSON-serializable)
 * @returns {Promise<void>}
 */
async function saveCheckpoint(agentId, runId, stepName, state) {
  const item = {
    agentId,
    runId,
    stepName,
    state: JSON.stringify(state),
    completedAt: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7-day TTL
  };

  try {
    await ddb.send(
      new PutCommand({
        TableName: CHECKPOINT_TABLE,
        Item: item,
      })
    );
    console.log(`[checkpoint] Saved: agent=${agentId} run=${runId} step=${stepName}`);
  } catch (err) {
    console.error(`[checkpoint] Save failed: ${err.message}`, { agentId, runId, stepName });
    throw err;
  }
}

/**
 * Load the most recent checkpoint for an agent run.
 * Used on restart to determine where to resume.
 *
 * @param {string} agentId - Agent identifier
 * @param {string} runId - Run identifier to look up (if null, finds the latest run)
 * @returns {Promise<object|null>} Last checkpoint or null if none exists
 */
async function loadCheckpoint(agentId, runId) {
  try {
    if (runId) {
      // Look for checkpoints from a specific run
      const result = await ddb.send(
        new QueryCommand({
          TableName: CHECKPOINT_TABLE,
          KeyConditionExpression: "agentId = :agentId",
          FilterExpression: "runId = :runId",
          ExpressionAttributeValues: {
            ":agentId": agentId,
            ":runId": runId,
          },
          ScanIndexForward: false, // newest first
          Limit: 10,
        })
      );

      if (!result.Items || result.Items.length === 0) {
        return null;
      }

      // Build the list of completed steps from all checkpoints in this run
      const completedSteps = result.Items.map((item) => item.stepName).filter(Boolean);
      const latest = result.Items[0];

      return {
        agentId,
        runId,
        stepName: latest.stepName,
        state: JSON.parse(latest.state || "{}"),
        completedAt: latest.completedAt,
        completedSteps: [...new Set(completedSteps)],
      };
    }

    // No runId — find the most recent incomplete run
    const result = await ddb.send(
      new QueryCommand({
        TableName: CHECKPOINT_TABLE,
        KeyConditionExpression: "agentId = :agentId",
        ExpressionAttributeValues: {
          ":agentId": agentId,
        },
        ScanIndexForward: false,
        Limit: 1,
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    const latest = result.Items[0];
    const state = JSON.parse(latest.state || "{}");

    // Only return if the last checkpoint was a failure (needs resume)
    if (state.status === "failed") {
      return {
        agentId,
        runId: latest.runId,
        stepName: latest.stepName,
        state,
        completedAt: latest.completedAt,
        completedSteps: state.completedSteps || [],
      };
    }

    return null;
  } catch (err) {
    console.error(`[checkpoint] Load failed: ${err.message}`, { agentId, runId });
    throw err;
  }
}

/**
 * Calculate delay for retry backoff.
 *
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {string} strategy - "exponential" or "linear"
 * @returns {number} Delay in milliseconds
 */
function calculateBackoff(attempt, strategy) {
  if (strategy === "linear") {
    // 1s, 2s, 3s, 4s...
    return (attempt + 1) * 1000;
  }
  // Exponential: 1s, 2s, 4s, 8s...
  return Math.pow(2, attempt) * 1000;
}

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap a function with checkpoint save on success and retry on failure.
 * This is the primary interface for crash-safe step execution.
 *
 * On success: saves checkpoint with result state, returns the result.
 * On failure: retries with backoff up to maxRetries, then throws.
 *
 * @param {string} agentId - Agent identifier
 * @param {string} runId - Current run identifier
 * @param {string} stepName - Name of the step (for checkpoint key)
 * @param {string[]} completedSteps - List of already-completed step names
 * @param {Function} fn - Async function to execute. Must return a JSON-serializable result.
 * @param {object} options - Retry options
 * @param {string} [options.strategy="exponential"] - Backoff strategy
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @returns {Promise<*>} Result of fn()
 * @throws {Error} If fn fails after all retries
 */
async function withCheckpoint(agentId, runId, stepName, completedSteps, fn, options = {}) {
  const { strategy = "exponential", maxRetries = 3 } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Execute the step
      const result = await fn();

      // Save success checkpoint
      try {
        await saveCheckpoint(agentId, runId, stepName, {
          status: "completed",
          result,
          completedSteps: [...completedSteps, stepName],
          attempt,
        });
      } catch (cpErr) {
        // Checkpoint save failed — log but don't fail the step
        // The step itself succeeded, so we continue
        console.warn(
          `[checkpoint] Failed to save success checkpoint for step "${stepName}": ${cpErr.message}`
        );
      }

      return result;
    } catch (err) {
      lastError = err;
      console.error(
        `[checkpoint] Step "${stepName}" failed (attempt ${attempt + 1}/${maxRetries + 1}): ${err.message}`
      );

      if (attempt < maxRetries) {
        const delayMs = calculateBackoff(attempt, strategy);
        console.log(`[checkpoint] Retrying "${stepName}" in ${delayMs}ms...`);
        await sleep(delayMs);
      }
    }
  }

  // All retries exhausted
  throw new Error(
    `Step "${stepName}" failed after ${maxRetries + 1} attempts. Last error: ${lastError.message}`
  );
}

module.exports = {
  saveCheckpoint,
  loadCheckpoint,
  withCheckpoint,
  calculateBackoff,
  CHECKPOINT_TABLE,
};
