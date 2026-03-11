/**
 * Build Runner — Simulated mission execution engine.
 *
 * Walks through a MissionMap emitting SSE-compatible progress events
 * with realistic timing. Designed to be consumed by the chat API route
 * and eventually replaced with real NPC Guide execution.
 *
 * Supports pause/resume for human-in-the-loop control (M27).
 */

import { MissionMap, Mission } from "./mission-architect";

// --- Event Types ---

export type BuildEvent =
  | { type: "build-start"; totalMissions: number; projectName: string }
  | {
      type: "mission-start";
      missionId: number;
      name: string;
      pipelineBlocks: string[];
    }
  | {
      type: "block-start";
      missionId: number;
      blockIndex: number;
      blockName: string;
    }
  | {
      type: "block-complete";
      missionId: number;
      blockIndex: number;
      blockName: string;
    }
  | { type: "task-log"; missionId: number; message: string }
  | { type: "mission-complete"; missionId: number }
  | { type: "build-complete"; totalTime: number }
  | { type: "build-paused" }
  | { type: "build-resumed" };

// --- Realistic log message templates ---

const LOG_TEMPLATES: Record<string, string[]> = {
  "Project Init": [
    "Initializing project directory...",
    "Creating package.json with project metadata",
    "Setting up TypeScript configuration",
  ],
  "Dependency Install": [
    "Installing production dependencies...",
    "Resolving peer dependencies",
    "Linking node_modules — 847 packages",
  ],
  "Config Files": [
    "Writing .env.example with required variables",
    "Generating tsconfig.json",
    "Creating eslint + prettier configs",
  ],
  "Folder Structure": [
    "Scaffolding src/ directory tree",
    "Creating lib/, handlers/, utils/ directories",
    "Adding index files for each module",
  ],
  "Dev Server": [
    "Configuring dev server with hot reload",
    "Testing local startup — port 3000",
    "Dev server responding OK",
  ],
  "Schema Design": [
    "Analyzing data requirements from brief...",
    "Generating table definitions",
    "Adding indexes for query performance",
  ],
  "Migration Runner": [
    "Creating migration files...",
    "Running initial migration — 0 → 1",
    "Migration complete, schema verified",
  ],
  "Data Access Layer": [
    "Building repository pattern for data access",
    "Adding connection pooling config",
    "Implementing query builder helpers",
  ],
  "Seed Data": [
    "Generating realistic seed data...",
    "Inserting 50 sample records",
    "Seed data verified — all foreign keys intact",
  ],
  "Input Validator": [
    "Building input validation schemas",
    "Adding request sanitization middleware",
    "Validator tests passing — 12/12",
  ],
  "Core Logic": [
    "Implementing main processing pipeline...",
    "Adding business rule engine",
    "Core logic unit tests — all green",
  ],
  "Output Formatter": [
    "Building response serializer",
    "Adding content negotiation (JSON/CSV)",
    "Output format tests passing",
  ],
  "Error Handler": [
    "Implementing error boundary with retry logic",
    "Adding structured error logging",
    "Error recovery tests — 8/8 passing",
  ],
  "API Client": [
    "Generating typed API client from spec...",
    "Adding request/response interceptors",
    "API client integration test — connected",
  ],
  "Webhook Handler": [
    "Setting up webhook endpoint with signature verification",
    "Adding idempotency key tracking",
    "Webhook replay test — verified",
  ],
  "Data Transformer": [
    "Building ETL pipeline for data normalization",
    "Adding field mapping configuration",
    "Transform validation — schema match OK",
  ],
  "Retry Logic": [
    "Implementing exponential backoff with jitter",
    "Adding circuit breaker for downstream failures",
    "Retry tests — all failure modes covered",
  ],
  "Build Config": [
    "Configuring production build pipeline",
    "Optimizing bundle — tree shaking enabled",
    "Build output: 2.3MB → 890KB after minification",
  ],
  "Deploy Script": [
    "Writing deployment automation script",
    "Adding rollback capability",
    "Dry-run deployment — success",
  ],
  "Health Check": [
    "Adding /health endpoint with dependency checks",
    "Configuring readiness and liveness probes",
    "Health check responding — all systems green",
  ],
  "Monitoring Setup": [
    "Wiring AgentLens proxy for cost tracking",
    "Adding structured logging with correlation IDs",
    "Dashboard auto-configured — ready to ship",
  ],
  "Lambda Package": [
    "Packaging Lambda deployment artifact...",
    "Stripping devDependencies — 847 → 124 packages",
    "Artifact size: 12.4MB (under 50MB limit)",
  ],
  "Proxy Auto-Wire": [
    "Configuring AgentLens proxy endpoint",
    "Setting routing rules for model selection",
    "Proxy connection verified — latency: 3ms overhead",
  ],
  "Integration Tests": [
    "Running full integration test suite...",
    "Testing end-to-end flow with mock services",
    "38/38 integration tests passing",
  ],
  "Layout Shell": [
    "Building responsive layout with sidebar navigation",
    "Adding dark mode theme configuration",
    "Shell rendering — lighthouse score: 98",
  ],
  "Page Router": [
    "Setting up file-based routing",
    "Adding route guards and redirects",
    "All routes resolving correctly",
  ],
  "Component Library": [
    "Creating shared component library...",
    "Building data table with sort/filter/pagination",
    "Component storybook — 24 stories added",
  ],
  "Theme Config": [
    "Generating design tokens from brand palette",
    "Adding CSS custom properties",
    "Theme switching — light/dark verified",
  ],
  "Auth Provider": [
    "Configuring OAuth 2.0 provider...",
    "Building authorization code flow",
    "Auth provider test — token exchange OK",
  ],
  "Session Manager": [
    "Implementing session store with Redis",
    "Adding session expiry and renewal",
    "Session persistence test — passed",
  ],
  "Route Guard": [
    "Adding authentication middleware to protected routes",
    "Implementing role-based access control",
    "Guard tests — unauthorized requests blocked",
  ],
  "Token Refresh": [
    "Building token refresh flow with rotation",
    "Adding refresh token revocation",
    "Token lifecycle test — all states covered",
  ],
};

/** Fallback logs for blocks without specific templates. */
const GENERIC_LOGS = [
  "Processing...",
  "Building component...",
  "Running validation checks...",
  "Writing output files...",
  "Verification complete",
];

// --- Build Runner ---

export class BuildRunner {
  private missionMap: MissionMap;
  private paused = false;
  private pauseResolve: (() => void) | null = null;
  private aborted = false;
  private startTime = 0;

  constructor(missionMap: MissionMap) {
    this.missionMap = missionMap;
  }

  /**
   * Execute the build as an async generator yielding BuildEvents.
   * Each event should be streamed to the client as it's produced.
   */
  async *run(): AsyncGenerator<BuildEvent> {
    this.startTime = Date.now();
    this.aborted = false;

    // Build start
    yield {
      type: "build-start",
      totalMissions: this.missionMap.totalMissions,
      projectName: this.missionMap.projectName,
    };

    await this.wait(randomBetween(800, 1500));

    for (const mission of this.missionMap.missions) {
      if (this.aborted) return;
      yield* this.executeMission(mission);
    }

    // Build complete
    yield {
      type: "build-complete",
      totalTime: Date.now() - this.startTime,
    };
  }

  /**
   * Execute a single mission, yielding events for each pipeline block.
   */
  private async *executeMission(mission: Mission): AsyncGenerator<BuildEvent> {
    // Mission start
    yield {
      type: "mission-start",
      missionId: mission.id,
      name: mission.name,
      pipelineBlocks: mission.pipelineBlocks,
    };

    await this.wait(randomBetween(500, 1200));

    for (let i = 0; i < mission.pipelineBlocks.length; i++) {
      if (this.aborted) return;
      await this.checkPause();

      const blockName = mission.pipelineBlocks[i];

      // Block start
      yield {
        type: "block-start",
        missionId: mission.id,
        blockIndex: i,
        blockName,
      };

      // Emit 1-3 task logs during this block
      const logs = getLogsForBlock(blockName);
      const logCount = Math.min(logs.length, randomBetween(1, 3));
      for (let l = 0; l < logCount; l++) {
        if (this.aborted) return;
        await this.checkPause();
        await this.wait(randomBetween(600, 1800));

        yield {
          type: "task-log",
          missionId: mission.id,
          message: logs[l],
        };
      }

      // Simulate block work (2-5 seconds total for the block)
      await this.wait(randomBetween(800, 2200));

      // Block complete
      yield {
        type: "block-complete",
        missionId: mission.id,
        blockIndex: i,
        blockName,
      };

      // Small gap between blocks
      await this.wait(randomBetween(300, 800));
    }

    // Occasional extra task log after all blocks (mission wrap-up)
    if (Math.random() > 0.4) {
      await this.wait(randomBetween(400, 1000));
      yield {
        type: "task-log",
        missionId: mission.id,
        message: `Mission ${mission.id} verified — all checks passing`,
      };
    }

    await this.wait(randomBetween(300, 600));

    // Mission complete
    yield {
      type: "mission-complete",
      missionId: mission.id,
    };

    // Pause between missions (feels like a context switch)
    await this.wait(randomBetween(1000, 2500));
  }

  /**
   * Pause the build. Blocks execution until resume() is called.
   */
  pause(): BuildEvent {
    this.paused = true;
    return { type: "build-paused" };
  }

  /**
   * Resume a paused build.
   */
  resume(): BuildEvent {
    this.paused = false;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
    return { type: "build-resumed" };
  }

  /**
   * Abort the build entirely.
   */
  abort(): void {
    this.aborted = true;
    // Also unpause so the generator can exit
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
  }

  /** Whether the build is currently paused. */
  get isPaused(): boolean {
    return this.paused;
  }

  /**
   * If paused, wait until resumed.
   */
  private async checkPause(): Promise<void> {
    if (this.paused) {
      await new Promise<void>((resolve) => {
        this.pauseResolve = resolve;
      });
    }
  }

  /**
   * Sleep for ms, but interruptible by abort.
   */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      if (this.aborted) {
        clearTimeout(timer);
        resolve();
      }
    });
  }
}

// --- Helpers ---

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getLogsForBlock(blockName: string): string[] {
  // Direct match
  if (LOG_TEMPLATES[blockName]) {
    return LOG_TEMPLATES[blockName];
  }

  // Partial match — look for blocks that contain parts of the name
  for (const [key, logs] of Object.entries(LOG_TEMPLATES)) {
    if (
      blockName.toLowerCase().includes(key.toLowerCase()) ||
      key.toLowerCase().includes(blockName.toLowerCase())
    ) {
      return logs.map((log) => log.replace(key, blockName));
    }
  }

  // If blockName contains "Client" or "Connector", generate specific logs
  if (blockName.includes("Client") || blockName.includes("Connector")) {
    const service = blockName.replace(/ (Client|Connector)$/, "");
    return [
      `Initializing ${service} API client...`,
      `Authenticating with ${service} — credentials verified`,
      `${service} connection test — response OK (200)`,
    ];
  }

  if (blockName.includes("OAuth")) {
    const service = blockName.replace(/ OAuth$/, "");
    return [
      `Configuring ${service} OAuth 2.0 flow...`,
      `Registering callback URL with ${service}`,
      `${service} OAuth test — token exchange successful`,
    ];
  }

  if (blockName.includes("Trigger") || blockName.includes("Listener")) {
    return [
      `Setting up ${blockName}...`,
      `Configuring event handler and routing`,
      `${blockName} — listening and ready`,
    ];
  }

  if (blockName.includes("Sender") || blockName.includes("Writer")) {
    return [
      `Building ${blockName} with template support...`,
      `Adding rate limiting and queue management`,
      `${blockName} test — delivery confirmed`,
    ];
  }

  return GENERIC_LOGS.map((log) => `[${blockName}] ${log}`);
}
