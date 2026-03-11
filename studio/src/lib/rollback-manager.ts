/**
 * Rollback Manager — Version tracking, rollback, and promotion for deployed agents.
 *
 * Maintains an in-memory version history per agent. In production this
 * would be backed by DynamoDB. Simulates Lambda alias updates and proxy
 * routing changes with realistic delays.
 */

import { RollbackResult, AgentVersionEntry } from "./types";

/** In-memory version history store. Keyed by agentId. */
const versionHistory = new Map<string, AgentVersionEntry[]>();

/**
 * Record a new deployment in the version history.
 */
export function recordDeployment(
  agentId: string,
  version: string,
  lambdaArn?: string
): void {
  const history = versionHistory.get(agentId) || [];

  // Mark any existing active version as retired
  for (const entry of history) {
    if (entry.status === "active") {
      entry.status = "retired";
    }
  }

  history.push({
    version,
    deployedAt: new Date().toISOString(),
    status: "active",
    lambdaArn,
  });

  versionHistory.set(agentId, history);
}

/**
 * Get the full version history for an agent.
 */
export function getVersionHistory(agentId: string): AgentVersionEntry[] {
  return versionHistory.get(agentId) || [];
}

/**
 * Get the currently active version for an agent.
 */
export function getActiveVersion(agentId: string): AgentVersionEntry | null {
  const history = versionHistory.get(agentId) || [];
  return history.find((e) => e.status === "active") || null;
}

/**
 * Get the previous version (most recent retired) for rollback targeting.
 */
export function getPreviousVersion(agentId: string): AgentVersionEntry | null {
  const history = versionHistory.get(agentId) || [];
  const retired = history.filter((e) => e.status === "retired");
  return retired.length > 0 ? retired[retired.length - 1] : null;
}

/**
 * Roll back an agent from one version to another.
 *
 * Simulates:
 * 1. Update Lambda alias to point to previous version
 * 2. Update proxy routing to use previous config
 * 3. Log the rollback event
 */
export async function rollback(
  agentId: string,
  fromVersion: string,
  toVersion: string
): Promise<RollbackResult> {
  const history = versionHistory.get(agentId);

  if (!history || history.length === 0) {
    return {
      success: false,
      agentId,
      fromVersion,
      toVersion,
      timestamp: new Date().toISOString(),
      message: `No version history found for agent ${agentId}`,
    };
  }

  const targetEntry = history.find((e) => e.version === toVersion);
  if (!targetEntry) {
    return {
      success: false,
      agentId,
      fromVersion,
      toVersion,
      timestamp: new Date().toISOString(),
      message: `Version ${toVersion} not found in history for agent ${agentId}`,
    };
  }

  // Simulate Lambda alias update
  await delay(randomBetween(800, 1500));

  // Simulate proxy routing update
  await delay(randomBetween(400, 800));

  // Update version statuses
  for (const entry of history) {
    if (entry.version === fromVersion) {
      entry.status = "rolled-back";
    }
    if (entry.version === toVersion) {
      entry.status = "active";
    }
  }

  versionHistory.set(agentId, history);

  return {
    success: true,
    agentId,
    fromVersion,
    toVersion,
    timestamp: new Date().toISOString(),
    message: `Rolled back ${agentId} from v${fromVersion} to v${toVersion} — Lambda alias updated, proxy re-routed`,
  };
}

/**
 * Promote the current active version, permanently retiring all previous versions.
 * Called after a successful shadow test confirms the new version is stable.
 */
export async function promote(agentId: string, version: string): Promise<void> {
  const history = versionHistory.get(agentId);
  if (!history) return;

  // Simulate cleanup of old Lambda versions
  await delay(randomBetween(500, 1000));

  // Mark everything except the promoted version as retired
  for (const entry of history) {
    if (entry.version !== version) {
      entry.status = "retired";
    } else {
      entry.status = "active";
    }
  }

  versionHistory.set(agentId, history);
}

/**
 * Check if an agent has a previous version available for rollback.
 */
export function canRollback(agentId: string): boolean {
  const prev = getPreviousVersion(agentId);
  return prev !== null;
}

/**
 * Clear version history for an agent (used in testing).
 */
export function clearHistory(agentId: string): void {
  versionHistory.delete(agentId);
}

// --- Helpers ---

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
