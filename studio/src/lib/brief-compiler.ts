/**
 * Brief Compiler — Converts collected conversation fields into structured brief.
 *
 * Two stages:
 * 1. compileBrief() — raw markdown string from collected fields
 * 2. parseBrief() — LLM-powered extraction of intent, stack, features, constraints, complexity
 */

import OpenAI from "openai";
import { BriefState } from "./types";

function getOpenAI() {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || undefined;
  return new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: baseURL?.includes("openrouter")
      ? { "HTTP-Referer": "https://agentlens.dev", "X-Title": "AgentLens Studio" }
      : undefined,
  });
}
function getModel() { return process.env.LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini"; }

/** Structured output from the brief parser LLM call. */
export interface ParsedBrief {
  projectName: string;
  intent: "build" | "automate" | "monitor" | "integrate" | "migrate";
  stack: string[];
  features: string[];
  constraints: string[];
  complexity: "simple" | "moderate" | "complex";
  trigger: string;
  output: string;
  dataSources: string[];
  integrations: string[];
}

/**
 * Compile collected fields into a raw brief markdown string.
 * This is the human-readable version that feeds into parseBrief().
 */
export function compileBrief(briefState: BriefState): string {
  const lines: string[] = [];

  lines.push("# Agent Brief");
  lines.push("");

  if (briefState.projectType) {
    lines.push("## Purpose");
    lines.push(briefState.projectType);
    lines.push("");
  }

  if (briefState.trigger) {
    lines.push("## Trigger");
    lines.push(briefState.trigger);
    lines.push("");
  }

  if (briefState.dataSources) {
    lines.push("## Data Sources");
    lines.push(briefState.dataSources);
    lines.push("");
  }

  if (briefState.integrations) {
    lines.push("## Integrations");
    lines.push(briefState.integrations);
    lines.push("");
  }

  if (briefState.output) {
    lines.push("## Output");
    lines.push(briefState.output);
    lines.push("");
  }

  if (briefState.constraints) {
    lines.push("## Constraints");
    lines.push(briefState.constraints);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Parse a raw brief string into structured data using LLM.
 * Detects intent, extracts stack, features, constraints, and rates complexity.
 */
export async function parseBrief(rawBrief: string): Promise<ParsedBrief> {
  const systemPrompt = `You are a technical project analyst. Given an agent brief, extract structured information.

Analyze the brief and return a JSON object with these fields:

- projectName: A short, descriptive name for this agent (2-4 words, kebab-case friendly). Example: "crm-stale-deal-checker", "daily-report-bot", "lead-enrichment-pipeline"
- intent: One of "build", "automate", "monitor", "integrate", "migrate". What is the primary intent?
  - "build" = creating something new from scratch
  - "automate" = taking a manual process and making it automatic
  - "monitor" = watching data/systems and alerting on conditions
  - "integrate" = connecting two or more systems together
  - "migrate" = moving data or processes from one system to another
- stack: Array of technologies/services mentioned or implied. Include SDKs, APIs, databases, platforms. Example: ["openai", "hubspot", "slack", "dynamodb"]
- features: Array of specific capabilities the agent needs. Be precise. Example: ["check HubSpot for deals with no activity >30 days", "send Slack summary to #sales channel", "run daily at 9am EST"]
- constraints: Array of things the agent should NOT do or limits it must respect. Example: ["never auto-delete records", "max 100 API calls per day", "don't email customers directly"]
- complexity: Rate as "simple" (1-2 integrations, single trigger, straightforward logic), "moderate" (2-4 integrations, some conditional logic, multiple outputs), or "complex" (5+ integrations, stateful workflows, error recovery needed, human-in-the-loop)
- trigger: The trigger mechanism. Example: "cron: 0 9 * * *", "webhook: stripe.payment_intent.succeeded", "manual"
- output: Where results go. Example: "slack:#sales-alerts", "email:team@company.com", "google-sheet:Deal Tracker"
- dataSources: Array of data sources. Example: ["hubspot-crm", "google-sheets", "postgresql"]
- integrations: Array of external services. Example: ["slack", "hubspot", "stripe", "sendgrid"]

Be precise. Only extract what is explicitly stated or clearly implied. Do not invent information.
If a field has no data, use an empty array [] or reasonable default.

Respond with ONLY valid JSON, no markdown fences.`;

  const response = await getOpenAI().chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: rawBrief },
    ],
    temperature: 0,
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content?.trim() || "{}";
  const jsonStr = content.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(jsonStr);

  return {
    projectName: parsed.projectName || "unnamed-agent",
    intent: parsed.intent || "build",
    stack: parsed.stack || [],
    features: parsed.features || [],
    constraints: parsed.constraints || [],
    complexity: parsed.complexity || "moderate",
    trigger: parsed.trigger || "manual",
    output: parsed.output || "",
    dataSources: parsed.dataSources || [],
    integrations: parsed.integrations || [],
  };
}
