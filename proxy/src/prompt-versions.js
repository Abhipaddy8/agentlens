/**
 * Prompt versioning.
 * Tracks system prompt versions per agent, stores quality scores,
 * enables one-click rollback to previous version.
 */

const { ddb, TABLE } = require("./dynamo");
const { PutCommand, GetCommand, QueryCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

const TABLE_VERSIONS = process.env.TABLE_VERSIONS || "agentlens-prompt-versions";

function hashPrompt(content) {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Record a prompt version for an agent.
 * Called on each request — only writes if version is new.
 */
async function trackVersion(agentId, version, systemPrompt) {
  if (!version || !systemPrompt) return null;

  const versionKey = `${agentId}#${version}`;
  const promptHash = hashPrompt(systemPrompt);

  try {
    // Check if this version already exists
    const existing = await ddb.send(new GetCommand({
      TableName: TABLE_VERSIONS,
      Key: { agentId, version },
    }));

    if (existing.Item) {
      // Increment call count
      await ddb.send(new UpdateCommand({
        TableName: TABLE_VERSIONS,
        Key: { agentId, version },
        UpdateExpression: "ADD callCount :inc SET lastUsed = :now",
        ExpressionAttributeValues: {
          ":inc": 1,
          ":now": new Date().toISOString(),
        },
      }));
      return existing.Item;
    }

    // New version — store it
    const item = {
      agentId,
      version,
      promptHash,
      systemPrompt,
      callCount: 1,
      avgLatencyMs: 0,
      errorRate: 0,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      active: true,
    };

    await ddb.send(new PutCommand({
      TableName: TABLE_VERSIONS,
      Item: item,
    }));

    return item;
  } catch (err) {
    console.error("Prompt version tracking failed:", err.message);
    return null;
  }
}

/**
 * Get all versions for an agent.
 */
async function getVersions(agentId) {
  try {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE_VERSIONS,
      KeyConditionExpression: "agentId = :aid",
      ExpressionAttributeValues: { ":aid": agentId },
      ScanIndexForward: false, // newest first
    }));
    return res.Items || [];
  } catch (err) {
    console.error("Failed to get versions:", err.message);
    return [];
  }
}

/**
 * Get the active version for an agent (for rollback).
 */
async function getActiveVersion(agentId) {
  try {
    const versions = await getVersions(agentId);
    return versions.find(v => v.active) || versions[0] || null;
  } catch {
    return null;
  }
}

/**
 * Rollback: set a specific version as active, deactivate others.
 */
async function rollbackTo(agentId, version) {
  try {
    const versions = await getVersions(agentId);
    for (const v of versions) {
      await ddb.send(new UpdateCommand({
        TableName: TABLE_VERSIONS,
        Key: { agentId, version: v.version },
        UpdateExpression: "SET active = :a",
        ExpressionAttributeValues: { ":a": v.version === version },
      }));
    }
    return { ok: true, agentId, activeVersion: version };
  } catch (err) {
    console.error("Rollback failed:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Update quality metrics for a version after a call completes.
 */
async function updateMetrics(agentId, version, latencyMs, success) {
  if (!version) return;
  try {
    const updateExpr = success
      ? "ADD callCount :zero SET lastUsed = :now"
      : "ADD errorCount :inc SET lastUsed = :now";

    await ddb.send(new UpdateCommand({
      TableName: TABLE_VERSIONS,
      Key: { agentId, version },
      UpdateExpression: "SET lastUsed = :now, lastLatencyMs = :lat",
      ExpressionAttributeValues: {
        ":now": new Date().toISOString(),
        ":lat": latencyMs,
      },
    }));
  } catch {
    // non-critical
  }
}

module.exports = {
  TABLE_VERSIONS,
  trackVersion,
  getVersions,
  getActiveVersion,
  rollbackTo,
  updateMetrics,
  hashPrompt,
};
