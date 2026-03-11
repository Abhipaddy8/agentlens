/**
 * Mission Architect — Deterministic mission map builder.
 *
 * Takes a ParsedBrief and produces a MissionMap using template matching.
 * No LLM calls — pure logic. Each mission gets pipeline blocks that show
 * WHAT is being built, not just the mission name.
 *
 * Ported from NPC Guide mission architect pattern.
 */

import { ParsedBrief } from "./brief-compiler";

/** A single mission in the build plan. */
export interface Mission {
  id: number;
  name: string;
  type: MissionType;
  goal: string;
  tasks: string[];
  pipelineBlocks: string[];
  status: "pending" | "active" | "complete" | "failed";
}

/** Mission types — each maps to a set of pipeline blocks. */
export type MissionType =
  | "scaffold"
  | "core-loop"
  | "data-layer"
  | "auth"
  | "ui"
  | "integration"
  | "ship";

/** The full mission map output. */
export interface MissionMap {
  projectName: string;
  intent: string;
  complexity: string;
  totalMissions: number;
  missions: Mission[];
}

/**
 * Pipeline block templates per mission type.
 * These define the visible steps shown to the user in the chat UI.
 */
const PIPELINE_BLOCKS: Record<MissionType, string[]> = {
  scaffold: [
    "Project Init",
    "Dependency Install",
    "Config Files",
    "Folder Structure",
    "Dev Server",
  ],
  "core-loop": [
    "Input Handler",
    "Core Logic",
    "Output Formatter",
    "Error Handler",
  ],
  "data-layer": [
    "Schema Design",
    "Migration Runner",
    "Data Access Layer",
    "Seed Data",
  ],
  auth: [
    "Auth Provider",
    "Session Manager",
    "Route Guard",
    "Token Refresh",
  ],
  ui: [
    "Layout Shell",
    "Page Router",
    "Component Library",
    "Theme Config",
  ],
  integration: [
    "API Client",
    "Webhook Handler",
    "Data Transformer",
    "Retry Logic",
  ],
  ship: [
    "Build Config",
    "Deploy Script",
    "Health Check",
    "Monitoring Setup",
  ],
};

/**
 * BUILD_MISSIONS — Template array for deterministic mission generation.
 *
 * Every agent gets scaffold + core-loop + ship.
 * Middle missions are added based on brief analysis.
 */
interface MissionTemplate {
  type: MissionType;
  name: string;
  goalTemplate: string;
  /** Condition function — if true, this mission is included. */
  condition: (brief: ParsedBrief) => boolean;
  /** Optional: customize pipeline blocks based on brief. */
  customBlocks?: (brief: ParsedBrief) => string[];
}

const BUILD_MISSIONS: MissionTemplate[] = [
  // Always included — project scaffolding
  {
    type: "scaffold",
    name: "Project Scaffold",
    goalTemplate:
      "Initialize {{projectName}} project structure, install dependencies, configure environment",
    condition: () => true,
  },

  // Data layer — if any data sources mentioned
  {
    type: "data-layer",
    name: "Data Layer",
    goalTemplate:
      "Set up data access for {{dataSources}}. Schema design, connection setup, and seed data",
    condition: (brief) => brief.dataSources.length > 0,
    customBlocks: (brief) => [
      "Schema Design",
      ...brief.dataSources.map((ds) => `${capitalize(ds)} Connector`),
      "Data Access Layer",
      "Seed Data",
    ],
  },

  // Auth — if integrations need OAuth or auth is mentioned
  {
    type: "auth",
    name: "Authentication",
    goalTemplate:
      "Configure authentication for {{integrations}} — OAuth flows, token management, credential storage",
    condition: (brief) => {
      const oauthServices = [
        "hubspot",
        "salesforce",
        "google",
        "slack",
        "github",
        "microsoft",
      ];
      return brief.integrations.some((i) =>
        oauthServices.includes(i.toLowerCase())
      );
    },
    customBlocks: (brief) => {
      const oauthServices = [
        "hubspot",
        "salesforce",
        "google",
        "slack",
        "github",
        "microsoft",
      ];
      const needed = brief.integrations.filter((i) =>
        oauthServices.includes(i.toLowerCase())
      );
      return [
        ...needed.map((s) => `${capitalize(s)} OAuth`),
        "Token Storage",
        "Token Refresh",
        "Route Guard",
      ];
    },
  },

  // Core loop — always included. The main agent logic.
  {
    type: "core-loop",
    name: "Core Agent Loop",
    goalTemplate:
      "Build the main agent logic — {{features_summary}}. Handle inputs, process data, produce outputs",
    condition: () => true,
    customBlocks: (brief) => {
      const blocks: string[] = [];

      // Trigger block
      if (brief.trigger.includes("cron") || brief.trigger.includes("schedule")) {
        blocks.push("Cron Trigger");
      } else if (brief.trigger.includes("webhook")) {
        blocks.push("Webhook Listener");
      } else {
        blocks.push("Manual Trigger");
      }

      // Core processing
      blocks.push("Input Validator");
      blocks.push("Core Logic");

      // Output block
      if (brief.output.includes("slack")) {
        blocks.push("Slack Sender");
      } else if (brief.output.includes("email")) {
        blocks.push("Email Sender");
      } else if (brief.output.includes("sheet")) {
        blocks.push("Sheet Writer");
      } else {
        blocks.push("Output Formatter");
      }

      blocks.push("Error Handler");
      return blocks;
    },
  },

  // Integration missions — one per integration
  {
    type: "integration",
    name: "Integrations",
    goalTemplate:
      "Connect to external services: {{integrations}}. API clients, webhook handlers, data transformers",
    condition: (brief) => brief.integrations.length > 0,
    customBlocks: (brief) =>
      [
        ...brief.integrations.map((i) => `${capitalize(i)} Client`),
        "Data Transformer",
        "Retry Logic",
      ].slice(0, 6), // Cap at 6 blocks
  },

  // UI — only if intent suggests a dashboard or the brief mentions UI
  {
    type: "ui",
    name: "Dashboard UI",
    goalTemplate:
      "Build monitoring dashboard for the agent — status, run history, configuration",
    condition: (brief) =>
      brief.features.some(
        (f) =>
          f.toLowerCase().includes("dashboard") ||
          f.toLowerCase().includes("ui") ||
          f.toLowerCase().includes("interface")
      ),
  },

  // Always included — ship it
  {
    type: "ship",
    name: "Deploy & Ship",
    goalTemplate:
      "Package {{projectName}} for deployment. Build config, deploy script, health check, monitoring auto-wire through AgentLens proxy",
    condition: () => true,
    customBlocks: () => [
      "Build Config",
      "Lambda Package",
      "Proxy Auto-Wire",
      "Health Check",
      "Integration Tests",
      "Monitoring Setup",
    ],
  },
];

/**
 * Build a mission map from a parsed brief.
 * Deterministic — same brief always produces the same mission map.
 */
export function buildMissionMap(brief: ParsedBrief): MissionMap {
  const missions: Mission[] = [];
  let id = 1;

  for (const template of BUILD_MISSIONS) {
    if (!template.condition(brief)) continue;

    const goal = interpolateGoal(template.goalTemplate, brief);
    const pipelineBlocks = template.customBlocks
      ? template.customBlocks(brief)
      : PIPELINE_BLOCKS[template.type];

    missions.push({
      id: id++,
      name: template.name,
      type: template.type,
      goal,
      tasks: [], // Filled by task generator (LLM call)
      pipelineBlocks,
      status: id === 2 ? "active" : "pending", // First mission starts active
    });
  }

  // Fix status — first mission should be active
  if (missions.length > 0) {
    missions[0].status = "active";
    for (let i = 1; i < missions.length; i++) {
      missions[i].status = "pending";
    }
  }

  return {
    projectName: brief.projectName,
    intent: brief.intent,
    complexity: brief.complexity,
    totalMissions: missions.length,
    missions,
  };
}

// --- Helpers ---

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function interpolateGoal(template: string, brief: ParsedBrief): string {
  return template
    .replace("{{projectName}}", brief.projectName)
    .replace("{{dataSources}}", brief.dataSources.join(", ") || "local data")
    .replace(
      "{{integrations}}",
      brief.integrations.join(", ") || "external services"
    )
    .replace(
      "{{features_summary}}",
      brief.features.slice(0, 3).join("; ") || "core agent functionality"
    );
}
