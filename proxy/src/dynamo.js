const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

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
  CACHE: process.env.TABLE_CACHE || "agentlens-cache",
  CONTROLS: process.env.TABLE_CONTROLS || "agentlens-controls",
  AGENTS: process.env.TABLE_AGENTS || "agentlens-agents",
};

// --- Controls (kill switch) ---

async function isKilled(agentId) {
  try {
    const res = await ddb.send(new GetCommand({
      TableName: TABLE.CONTROLS,
      Key: { agentId },
    }));
    return res.Item?.killed === true;
  } catch {
    return false; // fail open — if DynamoDB is down, don't block calls
  }
}

// --- Budgets ---

async function checkBudget(agentId) {
  try {
    const res = await ddb.send(new GetCommand({
      TableName: TABLE.BUDGETS,
      Key: { agentId },
    }));
    if (!res.Item) return { allowed: true, spent: 0, limit: null };
    const { spent = 0, monthlyLimit } = res.Item;
    if (monthlyLimit && spent >= monthlyLimit) {
      return { allowed: false, spent, limit: monthlyLimit };
    }
    return { allowed: true, spent, limit: monthlyLimit };
  } catch {
    return { allowed: true, spent: 0, limit: null }; // fail open
  }
}

async function incrementSpend(agentId, cost) {
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE.BUDGETS,
      Key: { agentId },
      UpdateExpression: "ADD spent :cost SET updatedAt = :now",
      ExpressionAttributeValues: {
        ":cost": cost,
        ":now": new Date().toISOString(),
      },
    }));
  } catch (err) {
    console.error("Failed to increment spend:", err.message);
  }
}

// --- Call Logging ---

async function logCall(callRecord) {
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE.CALLS,
      Item: callRecord,
    }));
  } catch (err) {
    console.error("Failed to log call:", err.message);
  }
}

// --- Agent Registry ---

async function registerAgent(agentId, metadata) {
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE.AGENTS,
      Item: {
        agentId,
        ...metadata,
        firstSeen: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }));
  } catch (err) {
    console.error("Failed to register agent:", err.message);
  }
}

async function getAgent(agentId) {
  try {
    const res = await ddb.send(new GetCommand({
      TableName: TABLE.AGENTS,
      Key: { agentId },
    }));
    return res.Item || null;
  } catch {
    return null;
  }
}

// --- Cache Controls (per-agent) ---

async function getCacheControl(agentId) {
  try {
    const res = await ddb.send(new GetCommand({
      TableName: TABLE.CONTROLS,
      Key: { agentId },
    }));
    return {
      enabled: res.Item?.cacheEnabled !== false, // default: ON
      ttlHours: res.Item?.cacheTTL || null,      // null = use global default
    };
  } catch {
    return { enabled: true, ttlHours: null }; // fail-open: cache on
  }
}

module.exports = {
  ddb,
  TABLE,
  isKilled,
  checkBudget,
  incrementSpend,
  logCall,
  registerAgent,
  getAgent,
  getCacheControl,
};
