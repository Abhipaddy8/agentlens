/**
 * AgentLens Agent Runtime — Memory Module
 *
 * Manages agent memory across three tiers:
 * - Long-term: persists forever, importance-scored, top 10 injected at session start
 * - Short-term: current run only, cleared on completion
 * - Shared: account-level, readable by all agents
 *
 * Storage: DynamoDB tables from architecture doc:
 * - agent_memory_long (PK: agentId, SK: memoryId)
 * - agent_memory_short (PK: agentId, SK: runId#stepIndex)
 * - agent_memory_shared (PK: accountId, SK: memoryId)
 *
 * @module agent-runtime/memory
 */

const { v4: uuidv4 } = require("uuid");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const ddb = DynamoDBDocumentClient.from(ddbClient);

const TABLE = {
  LONG_TERM: process.env.MEMORY_LONG_TABLE || "agentlens-agent-memory-long",
  SHORT_TERM: process.env.MEMORY_SHORT_TABLE || "agentlens-agent-memory-short",
  SHARED: process.env.MEMORY_SHARED_TABLE || "agentlens-agent-memory-shared",
};

/**
 * Inject the top 10 long-term memories by importance score.
 * Called at the start of every agent run to give the agent context
 * from previous runs.
 *
 * @param {string} agentId - Agent identifier
 * @param {number} [limit=10] - Maximum number of memories to inject
 * @returns {Promise<Array<{memoryId: string, content: string, importance: number, createdAt: string}>>}
 */
async function injectMemories(agentId, limit = 10) {
  try {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE.LONG_TERM,
        KeyConditionExpression: "agentId = :agentId",
        ExpressionAttributeValues: {
          ":agentId": agentId,
        },
        // DynamoDB doesn't support ORDER BY on non-key attributes,
        // so we fetch more and sort in memory
        Limit: 100,
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    // Sort by importance_score descending, take top N
    const sorted = result.Items.sort(
      (a, b) => (b.importance_score || 0) - (a.importance_score || 0)
    ).slice(0, limit);

    // Update last_accessed for each injected memory (fire and forget)
    const now = new Date().toISOString();
    for (const memory of sorted) {
      ddb
        .send(
          new UpdateCommand({
            TableName: TABLE.LONG_TERM,
            Key: { agentId, memoryId: memory.memoryId },
            UpdateExpression:
              "SET last_accessed = :now, access_count = if_not_exists(access_count, :zero) + :one",
            ExpressionAttributeValues: {
              ":now": now,
              ":zero": 0,
              ":one": 1,
            },
          })
        )
        .catch((err) =>
          console.warn(`[memory] Failed to update access for ${memory.memoryId}: ${err.message}`)
        );
    }

    return sorted.map((m) => ({
      memoryId: m.memoryId,
      content: m.content,
      importance: m.importance_score || 0,
      createdAt: m.created_at,
      accessCount: m.access_count || 0,
    }));
  } catch (err) {
    console.error(`[memory] Failed to inject memories for agent ${agentId}: ${err.message}`);
    throw err;
  }
}

/**
 * Save a new long-term memory.
 * Memories persist across runs and are scored by importance.
 * Higher importance = more likely to be injected in future runs.
 *
 * @param {string} agentId - Agent identifier
 * @param {string} content - Memory content (plain text)
 * @param {number} importance - Importance score (0.0 - 1.0). Higher = more important.
 * @returns {Promise<string>} The generated memory ID
 */
async function saveMemory(agentId, content, importance) {
  if (!content || typeof content !== "string") {
    throw new Error("Memory content must be a non-empty string");
  }

  if (typeof importance !== "number" || importance < 0 || importance > 1) {
    throw new Error("Importance must be a number between 0.0 and 1.0");
  }

  const memoryId = uuidv4();

  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE.LONG_TERM,
        Item: {
          agentId,
          memoryId,
          content,
          importance_score: importance,
          created_at: new Date().toISOString(),
          last_accessed: new Date().toISOString(),
          access_count: 0,
        },
      })
    );

    console.log(
      `[memory] Saved long-term memory: agent=${agentId} id=${memoryId} importance=${importance}`
    );
    return memoryId;
  } catch (err) {
    console.error(`[memory] Failed to save memory: ${err.message}`, { agentId, memoryId });
    throw err;
  }
}

/**
 * Save a short-term memory for the current run.
 * Short-term memories are step-level context that only matters during the current execution.
 * Cleared automatically when the run completes.
 *
 * @param {string} agentId - Agent identifier
 * @param {string} runId - Current run identifier
 * @param {number} stepIndex - Step index in the pipeline
 * @param {string} stepName - Name of the current step
 * @param {string} content - Memory content
 * @returns {Promise<void>}
 */
async function saveShortTermMemory(agentId, runId, stepIndex, stepName, content) {
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE.SHORT_TERM,
        Item: {
          agentId,
          sortKey: `${runId}#${String(stepIndex).padStart(4, "0")}`,
          runId,
          step_name: stepName,
          content,
          created_at: new Date().toISOString(),
          // TTL: auto-delete after 24 hours as a safety net
          ttl: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
        },
      })
    );
  } catch (err) {
    console.error(`[memory] Failed to save short-term memory: ${err.message}`, {
      agentId,
      runId,
      stepName,
    });
    throw err;
  }
}

/**
 * Get all short-term memories for a run, in step order.
 *
 * @param {string} agentId - Agent identifier
 * @param {string} runId - Run identifier
 * @returns {Promise<Array<{stepName: string, content: string, createdAt: string}>>}
 */
async function getShortTermMemories(agentId, runId) {
  try {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE.SHORT_TERM,
        KeyConditionExpression: "agentId = :agentId AND begins_with(sortKey, :prefix)",
        ExpressionAttributeValues: {
          ":agentId": agentId,
          ":prefix": `${runId}#`,
        },
        ScanIndexForward: true, // oldest first (step order)
      })
    );

    return (result.Items || []).map((m) => ({
      stepName: m.step_name,
      content: m.content,
      createdAt: m.created_at,
    }));
  } catch (err) {
    console.error(`[memory] Failed to get short-term memories: ${err.message}`, { agentId, runId });
    throw err;
  }
}

/**
 * Clear short-term memory after a run completes.
 * Deletes all short-term memory entries for the given run.
 *
 * @param {string} agentId - Agent identifier
 * @param {string} runId - Run identifier
 * @returns {Promise<number>} Number of entries deleted
 */
async function clearShortTerm(agentId, runId) {
  try {
    // First, query all items for this run
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE.SHORT_TERM,
        KeyConditionExpression: "agentId = :agentId AND begins_with(sortKey, :prefix)",
        ExpressionAttributeValues: {
          ":agentId": agentId,
          ":prefix": `${runId}#`,
        },
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return 0;
    }

    // Delete each item
    let deleted = 0;
    for (const item of result.Items) {
      try {
        await ddb.send(
          new DeleteCommand({
            TableName: TABLE.SHORT_TERM,
            Key: { agentId: item.agentId, sortKey: item.sortKey },
          })
        );
        deleted++;
      } catch (err) {
        console.warn(`[memory] Failed to delete short-term entry: ${err.message}`);
      }
    }

    console.log(`[memory] Cleared ${deleted} short-term memories for run ${runId}`);
    return deleted;
  } catch (err) {
    console.error(`[memory] Failed to clear short-term memory: ${err.message}`, {
      agentId,
      runId,
    });
    throw err;
  }
}

/**
 * Save a shared memory (account-level, readable by all agents).
 *
 * @param {string} accountId - Account identifier
 * @param {string} sourceAgentId - Agent that created this memory
 * @param {string} content - Memory content
 * @param {number} importance - Importance score (0.0 - 1.0)
 * @returns {Promise<string>} The generated memory ID
 */
async function saveSharedMemory(accountId, sourceAgentId, content, importance) {
  const memoryId = uuidv4();

  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE.SHARED,
        Item: {
          accountId,
          memoryId,
          content,
          source_agent: sourceAgentId,
          importance_score: importance,
          created_at: new Date().toISOString(),
        },
      })
    );

    console.log(`[memory] Saved shared memory: account=${accountId} source=${sourceAgentId}`);
    return memoryId;
  } catch (err) {
    console.error(`[memory] Failed to save shared memory: ${err.message}`, {
      accountId,
      sourceAgentId,
    });
    throw err;
  }
}

/**
 * Get shared memories for an account, sorted by importance.
 *
 * @param {string} accountId - Account identifier
 * @param {number} [limit=10] - Maximum number of memories
 * @returns {Promise<Array<{memoryId: string, content: string, sourceAgent: string, importance: number}>>}
 */
async function getSharedMemories(accountId, limit = 10) {
  try {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE.SHARED,
        KeyConditionExpression: "accountId = :accountId",
        ExpressionAttributeValues: {
          ":accountId": accountId,
        },
        Limit: 100,
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.sort((a, b) => (b.importance_score || 0) - (a.importance_score || 0))
      .slice(0, limit)
      .map((m) => ({
        memoryId: m.memoryId,
        content: m.content,
        sourceAgent: m.source_agent,
        importance: m.importance_score || 0,
        createdAt: m.created_at,
      }));
  } catch (err) {
    console.error(`[memory] Failed to get shared memories: ${err.message}`, { accountId });
    throw err;
  }
}

module.exports = {
  injectMemories,
  saveMemory,
  saveShortTermMemory,
  getShortTermMemories,
  clearShortTerm,
  saveSharedMemory,
  getSharedMemories,
  TABLE,
};
