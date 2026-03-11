/**
 * Deploy Pipeline — Orchestrates agent deployment from config to live Lambda.
 *
 * Simulates the full AWS deployment flow with realistic timing.
 * Each step yields progress events consumed by the chat SSE stream.
 * In production, replace the simulate* methods with real AWS SDK calls.
 */

import { DeployEvent } from "./types";

/** Agent config shape matching agentlens-agent.json schema. */
export interface AgentConfig {
  name: string;
  version: string;
  description: string;
  entryPoint: string;
  trigger: { type: "cron" | "webhook" | "manual"; schedule?: string; webhookPath?: string };
  integrations?: Array<{ name: string; type: string; config?: Record<string, unknown> }>;
  dataSources?: Array<{ name: string; type: string; config?: Record<string, unknown> }>;
  output: { type: string; config?: Record<string, unknown> };
  budget: { monthlyLimit: number; primaryModel: string; fallbackModel: string };
  checkpoint: { enabled: boolean; retryStrategy: string; maxRetries: number };
  proxy: { enabled: boolean; agentId: string };
  memory?: { longTerm?: boolean; shortTerm?: boolean; shared?: boolean };
  humanInTheLoop?: { enabled: boolean; approvalChannel?: string; actions?: string[] };
}

/** Credentials map: service name → decrypted credential value. */
export type CredentialMap = Record<string, string>;

const DEPLOY_STEPS = [
  "validate-config",
  "package-code",
  "provision-lambda",
  "wire-triggers",
  "connect-integrations",
  "auto-wire-proxy",
  "register-dashboard",
  "health-check",
] as const;

const STEP_LABELS: Record<string, string> = {
  "validate-config": "Validating agent configuration against schema",
  "package-code": "Packaging agent code + runtime modules",
  "provision-lambda": "Provisioning Lambda function",
  "wire-triggers": "Wiring trigger",
  "connect-integrations": "Connecting integrations",
  "auto-wire-proxy": "Auto-wiring AgentLens proxy",
  "register-dashboard": "Registering agent in dashboard",
  "health-check": "Running health check",
};

export class DeployPipeline {
  private agentConfig: AgentConfig;
  private credentials: CredentialMap;
  private sessionId: string;
  private region: string;
  private accountId: string;

  constructor(
    agentConfig: AgentConfig,
    credentials: CredentialMap,
    sessionId: string
  ) {
    this.agentConfig = agentConfig;
    this.credentials = credentials;
    this.sessionId = sessionId;
    this.region = process.env.AWS_REGION || "us-east-1";
    this.accountId = process.env.AWS_ACCOUNT_ID || "123456789012";
  }

  /**
   * Execute the full deploy pipeline as an async generator.
   * Yields progress events for each step so the UI can show real-time updates.
   */
  async *deploy(): AsyncGenerator<DeployEvent> {
    const agentId = this.agentConfig.proxy.agentId;

    try {
      // Step 1: Validate config
      yield* this.executeStep("validate-config", async () => {
        await delay(randomBetween(500, 800));
        this.validateConfig();
        return "Schema valid — 8 required fields verified";
      });

      // Step 2: Package code
      yield* this.executeStep("package-code", async () => {
        await delay(randomBetween(1000, 1800));
        return `Bundled ${this.agentConfig.entryPoint} + 5 runtime modules (handler, checkpoint, memory, router, hitl) — artifact: 12.4MB`;
      });

      // Step 3: Provision Lambda
      const lambdaArn = `arn:aws:lambda:${this.region}:${this.accountId}:function:agentlens-${agentId}`;
      yield* this.executeStep("provision-lambda", async () => {
        await delay(randomBetween(1500, 2500));
        return `Lambda created: ${lambdaArn} — 256MB, 30s timeout, Node.js 20.x`;
      });

      // Step 4: Wire triggers
      yield* this.executeStep("wire-triggers", async () => {
        await delay(randomBetween(800, 1500));
        const trigger = this.agentConfig.trigger;
        if (trigger.type === "cron") {
          return `CloudWatch Events rule: ${trigger.schedule} → ${lambdaArn}`;
        } else if (trigger.type === "webhook") {
          return `API Gateway: POST ${trigger.webhookPath} → ${lambdaArn}`;
        }
        return "Manual trigger — no automated invocation configured";
      });

      // Step 5: Connect integrations
      yield* this.executeStep("connect-integrations", async () => {
        await delay(randomBetween(800, 1200));
        const integrations = this.agentConfig.integrations || [];
        if (integrations.length === 0) {
          return "No integrations to connect";
        }
        const names = integrations.map((i) => i.name).join(", ");
        const envCount = Object.keys(this.credentials).length;
        return `Injected ${envCount} credentials as Lambda env vars for: ${names}`;
      });

      // Step 6: Auto-wire proxy
      const proxyEndpoint = `https://proxy.agentlens.dev/${agentId}`;
      yield* this.executeStep("auto-wire-proxy", async () => {
        await delay(randomBetween(600, 1000));
        return `Proxy registered: ${proxyEndpoint} — model: ${this.agentConfig.budget.primaryModel}, fallback: ${this.agentConfig.budget.fallbackModel}, budget: $${this.agentConfig.budget.monthlyLimit}/mo`;
      });

      // Step 7: Register in dashboard
      yield* this.executeStep("register-dashboard", async () => {
        await delay(randomBetween(500, 900));
        return `Agent ${agentId} v${this.agentConfig.version} written to agents DynamoDB table — dashboard live`;
      });

      // Step 8: Health check
      yield* this.executeStep("health-check", async () => {
        await delay(randomBetween(1000, 2000));
        return `Health check passed — Lambda invoked with test event, response: 200 OK (${randomBetween(120, 350)}ms)`;
      });

      // Deploy complete
      const endpoint =
        this.agentConfig.trigger.type === "webhook"
          ? `https://api.agentlens.dev${this.agentConfig.trigger.webhookPath}`
          : this.agentConfig.trigger.type === "cron"
          ? `cron: ${this.agentConfig.trigger.schedule}`
          : "manual invocation";

      yield {
        type: "deploy-complete",
        agentId,
        endpoint,
        dashboardUrl: `https://app.agentlens.dev/agents/${agentId}`,
      };
    } catch (err) {
      yield {
        type: "deploy-error",
        message: err instanceof Error ? err.message : "Unknown deploy error",
      };
    }
  }

  /**
   * Execute a single deploy step, yielding in-progress and complete/failed events.
   */
  private async *executeStep(
    step: string,
    fn: () => Promise<string>
  ): AsyncGenerator<DeployEvent> {
    yield {
      type: "deploy-progress",
      step,
      status: "in-progress",
      message: STEP_LABELS[step] || step,
    };

    try {
      const result = await fn();
      yield {
        type: "deploy-progress",
        step,
        status: "complete",
        message: result,
      };
    } catch (err) {
      yield {
        type: "deploy-progress",
        step,
        status: "failed",
        message: err instanceof Error ? err.message : "Step failed",
      };
      throw err;
    }
  }

  /**
   * Validate agent config against required fields.
   * In production, use ajv with the full JSON schema.
   */
  private validateConfig(): void {
    const required = [
      "name",
      "version",
      "description",
      "entryPoint",
      "trigger",
      "output",
      "budget",
      "checkpoint",
      "proxy",
    ];
    for (const field of required) {
      if (!(field in this.agentConfig)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    if (!this.agentConfig.checkpoint.enabled) {
      throw new Error("Checkpoint must be enabled — non-negotiable guardrail");
    }
    if (!this.agentConfig.proxy.enabled) {
      throw new Error("Proxy must be enabled — all LLM calls route through AgentLens");
    }
    if (!/^\d+\.\d+\.\d+$/.test(this.agentConfig.version)) {
      throw new Error(`Invalid version format: ${this.agentConfig.version} — expected semver (e.g., 1.0.0)`);
    }
  }
}

// --- Helpers ---

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
