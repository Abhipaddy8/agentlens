/**
 * AgentLens Studio — Autonomy Configuration
 *
 * Manages per-agent autonomy settings: which actions require human approval,
 * cost thresholds, and trust level (0 = approve everything, 100 = fully autonomous).
 *
 * @module lib/autonomy-config
 */

import { AutonomyConfig } from "./types";

// --- In-memory store (production: DynamoDB agentlens-autonomy table) ---

const configStore = new Map<string, AutonomyConfig>();

/**
 * Default autonomy config with 6 action categories.
 * Conservative defaults: most sensitive actions require approval.
 */
export function getDefaultAutonomyConfig(): AutonomyConfig {
  return {
    trustLevel: 40,
    actions: [
      {
        name: "send-email",
        label: "Send emails to contacts",
        requiresApproval: true,
        threshold: 10, // Auto-approve if sending to fewer than 10 contacts
      },
      {
        name: "update-crm",
        label: "Update CRM records (deals, contacts)",
        requiresApproval: true,
        threshold: 5, // Auto-approve if updating fewer than 5 records
      },
      {
        name: "delete-records",
        label: "Delete or archive records",
        requiresApproval: true, // Always require approval for deletions
      },
      {
        name: "spend-budget",
        label: "Spend on LLM API calls",
        requiresApproval: true,
        threshold: 1.0, // Auto-approve under $1.00
      },
      {
        name: "webhook-config",
        label: "Register or modify webhooks",
        requiresApproval: true,
      },
      {
        name: "read-data",
        label: "Read and analyze data",
        requiresApproval: false, // Reading is safe by default
      },
    ],
  };
}

/**
 * Fetch stored autonomy config for an agent. Returns default if none saved.
 */
export async function getAutonomyConfig(agentId: string): Promise<AutonomyConfig> {
  const stored = configStore.get(agentId);
  if (stored) return stored;

  // Return default config for known demo agents
  const defaultConfig = getDefaultAutonomyConfig();
  configStore.set(agentId, defaultConfig);
  return defaultConfig;
}

/**
 * Save autonomy config for an agent.
 */
export async function saveAutonomyConfig(agentId: string, config: AutonomyConfig): Promise<void> {
  configStore.set(agentId, config);
}

/**
 * Check if a specific action requires approval given the current config.
 *
 * Logic:
 * 1. If trust level is 100, nothing needs approval.
 * 2. If trust level is 0, everything needs approval.
 * 3. Otherwise, check the action's requiresApproval flag.
 * 4. If the action has a threshold and estimatedCost is below it, auto-approve.
 */
export function shouldRequireApproval(
  config: AutonomyConfig,
  action: string,
  estimatedCost?: number
): boolean {
  // Full autonomy — nothing needs approval
  if (config.trustLevel >= 100) return false;

  // Zero trust — everything needs approval
  if (config.trustLevel <= 0) return true;

  // Find the action in config
  const actionConfig = config.actions.find((a) => a.name === action);

  // Unknown actions require approval by default
  if (!actionConfig) return true;

  // If the action doesn't require approval, skip
  if (!actionConfig.requiresApproval) return false;

  // If there's a threshold and the cost/count is below it, auto-approve
  if (actionConfig.threshold !== undefined && estimatedCost !== undefined) {
    if (estimatedCost < actionConfig.threshold) return false;
  }

  return true;
}

/**
 * Adjust all toggles based on trust level slider.
 *
 * 0   = approve everything (all requiresApproval = true)
 * 25  = conservative (only read-data is autonomous)
 * 50  = balanced (read-data + spend-budget under threshold)
 * 75  = permissive (only delete-records + webhook-config need approval)
 * 100 = fully autonomous (all requiresApproval = false)
 */
export function applyTrustLevel(config: AutonomyConfig, level: number): AutonomyConfig {
  const clamped = Math.max(0, Math.min(100, level));
  const updated = { ...config, trustLevel: clamped, actions: config.actions.map((a) => ({ ...a })) };

  // Sensitivity ranking: lower = more sensitive
  const sensitivityMap: Record<string, number> = {
    "read-data": 10,
    "spend-budget": 30,
    "send-email": 50,
    "update-crm": 60,
    "webhook-config": 80,
    "delete-records": 90,
  };

  for (const action of updated.actions) {
    const sensitivity = sensitivityMap[action.name] ?? 50;
    // An action becomes autonomous when trust level exceeds its sensitivity
    action.requiresApproval = clamped < sensitivity;
  }

  return updated;
}
