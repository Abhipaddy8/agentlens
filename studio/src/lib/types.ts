/**
 * Types for the AgentLens Studio Conversation Controller.
 *
 * The controller tracks what information has been collected from the user
 * to build a complete agent brief.
 */

/** A single field extracted from the conversation. */
export interface CollectedField {
  /** Field identifier */
  key: BriefFieldKey;
  /** Human-readable label */
  label: string;
  /** The extracted value */
  value: string;
  /** Whether this field is required for the brief to be complete */
  required: boolean;
}

/** All trackable brief fields. */
export type BriefFieldKey =
  | "projectType"
  | "integrations"
  | "trigger"
  | "constraints"
  | "dataSources"
  | "output";

/** The full state of what's been collected so far. */
export interface BriefState {
  projectType: string | null;    // What the agent should do (required)
  integrations: string | null;   // Slack, HubSpot, Sheets, etc. (optional)
  trigger: string | null;        // schedule, webhook, manual (required)
  constraints: string | null;    // What it should NOT do (optional)
  dataSources: string | null;    // Where the agent reads from (optional)
  output: string | null;         // Where results go (required)
}

/** Metadata returned with each controller response. */
export interface ControllerMetadata {
  briefComplete: boolean;
  completionPercent: number;
  currentPhase: string;
  collectedFields: string[];
  briefState: BriefState;
}

/** Chat message format matching Vercel AI SDK. */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** An integration detected from conversation keywords. */
export interface DetectedIntegration {
  service: string;
  mode: "oauth" | "apikey" | "mcp";
  displayName: string;
  detected_keyword: string;
}

/** A stored credential for a connected integration. */
export interface StoredCredential {
  service: string;
  type: "oauth_token" | "api_key" | "mcp_url";
  connected: boolean;
  connectedAt: string;
  expiresAt?: string;
  metadata?: Record<string, string>;
}

// --- Deploy Pipeline Types ---

export interface DeployEvent {
  type: "deploy-progress" | "deploy-complete" | "deploy-error";
  step?: string;
  status?: "pending" | "in-progress" | "complete" | "failed";
  message?: string;
  agentId?: string;
  endpoint?: string;
  dashboardUrl?: string;
}

export interface ShadowTestEvent {
  type: "shadow-test-progress" | "shadow-test-complete";
  testCase?: number;
  total?: number;
  oldResult?: { latency: number; error: boolean; cost: number; response: string };
  newResult?: { latency: number; error: boolean; cost: number; response: string };
  qualityScore?: number;
  passed?: boolean;
  metrics?: ShadowTestMetrics;
}

export interface ShadowTestMetrics {
  responseQuality: number;
  latencyOld: number;
  latencyNew: number;
  errorRateOld: number;
  errorRateNew: number;
  costOld: number;
  costNew: number;
}

export interface ShadowTestResult {
  qualityScore: number;
  passed: boolean;
  threshold: number;
  metrics: ShadowTestMetrics;
}

export interface QualityReport {
  passed: boolean;
  qualityScore: number;
  recommendation: "deploy" | "rollback" | "manual-review";
  details: Record<string, number>;
}

export interface RollbackResult {
  success: boolean;
  agentId: string;
  fromVersion: string;
  toVersion: string;
  timestamp: string;
  message: string;
}

export interface AgentVersionEntry {
  version: string;
  deployedAt: string;
  status: "active" | "retired" | "rolled-back";
  lambdaArn?: string;
}

// --- Activity Feed Types ---

export interface ActivityEntry {
  id: string;
  timestamp: string;
  summary: string;
  cost: number;
  durationMs: number;
  status: "success" | "warning" | "error";
  details?: { steps: string[]; tools: string[]; tokensUsed: number };
}

// --- Memory Types ---

export interface MemoryItem {
  id: string;
  content: string;
  importance: number;
  createdAt: string;
  lastAccessed: string;
  accessCount: number;
}

/** Learning record from the memory manager (agent-discovered patterns). */
export interface Learning {
  id: string;
  content: string;
  source: string;
  learnedAt: string;
}

/** Learning item for display in the UI (simplified view). */
export interface LearningItem {
  id: string;
  content: string;
  learnedAt: string;
  sourceRunId?: string;
}

// --- Routing Types ---

export interface RoutingDecision {
  queryPreview: string;
  route: "web" | "database" | "documents" | "api";
  confidence: number;
  passedGate: boolean;
  timestamp: string;
  fallbackUsed?: boolean;
}

/** Field definition for the controller's tracking logic. */
export interface FieldDefinition {
  key: BriefFieldKey;
  label: string;
  required: boolean;
  description: string;
  examples: string;
}

/** All field definitions in the order the controller should ask about them. */
export const FIELD_DEFINITIONS: FieldDefinition[] = [
  {
    key: "projectType",
    label: "Project Type",
    required: true,
    description: "What the agent should do — its core purpose and behavior",
    examples: "CRM monitoring agent, lead enrichment pipeline, daily report generator",
  },
  {
    key: "trigger",
    label: "Trigger",
    required: true,
    description: "What kicks off the agent — schedule (cron), webhook, manual, or event-driven",
    examples: "Every morning at 9am, on new Stripe payment, manual button click",
  },
  {
    key: "dataSources",
    label: "Data Sources",
    required: false,
    description: "Where the agent reads its input data from",
    examples: "HubSpot CRM, Google Sheets, PostgreSQL database, REST API",
  },
  {
    key: "integrations",
    label: "Integrations",
    required: false,
    description: "External services the agent connects to",
    examples: "Slack, HubSpot, Google Sheets, Stripe, SendGrid",
  },
  {
    key: "output",
    label: "Output",
    required: true,
    description: "Where the agent's results go — the destination for its work",
    examples: "Slack channel, email, Google Sheet, webhook, dashboard",
  },
  {
    key: "constraints",
    label: "Constraints",
    required: false,
    description: "What the agent should NOT do, limits, guardrails",
    examples: "Never auto-delete records, max 100 API calls/day, don't email customers directly",
  },
];
