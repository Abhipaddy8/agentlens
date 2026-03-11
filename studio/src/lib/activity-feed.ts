/**
 * AgentLens Studio — Activity Feed
 *
 * Fetches and formats agent run history from agent_sessions DynamoDB table.
 * Returns plain English summaries, not raw step logs.
 *
 * Currently uses realistic mock data (OperaERP demo pattern).
 * Swap to DynamoDB reads when agent_sessions table is live.
 */

import { ActivityEntry } from "./types";

/** Raw session shape from DynamoDB (agent_sessions table) */
interface RawSession {
  sessionId: string;
  agentId: string;
  startedAt: string;
  completedAt: string;
  status: "success" | "warning" | "error";
  steps: Array<{ name: string; durationMs: number; tokensUsed: number }>;
  tools: string[];
  totalCost: number;
  totalTokens: number;
  trigger: string;
}

// ─── Mock Data ──────────────────────────────────────────────

const MOCK_SESSIONS: RawSession[] = [
  {
    sessionId: "sess-001",
    agentId: "opera-crm-monitor",
    startedAt: "2026-03-11T09:00:12Z",
    completedAt: "2026-03-11T09:01:47Z",
    status: "success",
    steps: [
      { name: "fetch-deals", durationMs: 18200, tokensUsed: 1240 },
      { name: "analyze-stale", durationMs: 32100, tokensUsed: 3100 },
      { name: "send-summary", durationMs: 4200, tokensUsed: 420 },
    ],
    tools: ["HubSpot", "Slack"],
    totalCost: 0.0142,
    totalTokens: 4760,
    trigger: "cron:9am",
  },
  {
    sessionId: "sess-002",
    agentId: "opera-crm-monitor",
    startedAt: "2026-03-11T08:00:05Z",
    completedAt: "2026-03-11T08:00:38Z",
    status: "success",
    steps: [
      { name: "fetch-deals", durationMs: 15400, tokensUsed: 1180 },
      { name: "analyze-stale", durationMs: 14200, tokensUsed: 2200 },
      { name: "send-summary", durationMs: 3800, tokensUsed: 380 },
    ],
    tools: ["HubSpot", "Slack"],
    totalCost: 0.0118,
    totalTokens: 3760,
    trigger: "cron:8am",
  },
  {
    sessionId: "sess-003",
    agentId: "opera-crm-monitor",
    startedAt: "2026-03-10T14:22:01Z",
    completedAt: "2026-03-10T14:23:15Z",
    status: "warning",
    steps: [
      { name: "fetch-deals", durationMs: 42000, tokensUsed: 1300 },
      { name: "analyze-stale", durationMs: 28400, tokensUsed: 2800 },
      { name: "send-summary", durationMs: 3600, tokensUsed: 410 },
    ],
    tools: ["HubSpot", "Slack"],
    totalCost: 0.0138,
    totalTokens: 4510,
    trigger: "webhook:deal-update",
  },
  {
    sessionId: "sess-004",
    agentId: "opera-crm-monitor",
    startedAt: "2026-03-10T09:00:08Z",
    completedAt: "2026-03-10T09:01:22Z",
    status: "success",
    steps: [
      { name: "fetch-deals", durationMs: 16800, tokensUsed: 1210 },
      { name: "analyze-stale", durationMs: 35600, tokensUsed: 3400 },
      { name: "send-summary", durationMs: 5100, tokensUsed: 480 },
    ],
    tools: ["HubSpot", "Slack"],
    totalCost: 0.0155,
    totalTokens: 5090,
    trigger: "cron:9am",
  },
  {
    sessionId: "sess-005",
    agentId: "opera-crm-monitor",
    startedAt: "2026-03-09T09:00:11Z",
    completedAt: "2026-03-09T09:02:04Z",
    status: "success",
    steps: [
      { name: "fetch-deals", durationMs: 21000, tokensUsed: 1450 },
      { name: "analyze-stale", durationMs: 62000, tokensUsed: 5200 },
      { name: "send-summary", durationMs: 4800, tokensUsed: 520 },
      { name: "update-crm-tags", durationMs: 15200, tokensUsed: 800 },
    ],
    tools: ["HubSpot", "Slack", "Google Sheets"],
    totalCost: 0.0234,
    totalTokens: 7970,
    trigger: "cron:9am",
  },
  {
    sessionId: "sess-006",
    agentId: "opera-crm-monitor",
    startedAt: "2026-03-08T16:45:22Z",
    completedAt: "2026-03-08T16:45:44Z",
    status: "error",
    steps: [
      { name: "fetch-deals", durationMs: 22000, tokensUsed: 820 },
    ],
    tools: ["HubSpot"],
    totalCost: 0.0024,
    totalTokens: 820,
    trigger: "manual",
  },
  {
    sessionId: "sess-007",
    agentId: "opera-crm-monitor",
    startedAt: "2026-03-08T09:00:06Z",
    completedAt: "2026-03-08T09:01:12Z",
    status: "success",
    steps: [
      { name: "fetch-deals", durationMs: 17100, tokensUsed: 1190 },
      { name: "analyze-stale", durationMs: 29800, tokensUsed: 2600 },
      { name: "send-summary", durationMs: 4400, tokensUsed: 440 },
    ],
    tools: ["HubSpot", "Slack"],
    totalCost: 0.0131,
    totalTokens: 4230,
    trigger: "cron:9am",
  },
  {
    sessionId: "sess-008",
    agentId: "opera-crm-monitor",
    startedAt: "2026-03-07T09:00:09Z",
    completedAt: "2026-03-07T09:01:55Z",
    status: "success",
    steps: [
      { name: "fetch-deals", durationMs: 19200, tokensUsed: 1380 },
      { name: "analyze-stale", durationMs: 51000, tokensUsed: 4800 },
      { name: "send-summary", durationMs: 6200, tokensUsed: 560 },
      { name: "create-follow-ups", durationMs: 28300, tokensUsed: 2100 },
    ],
    tools: ["HubSpot", "Slack", "Google Calendar"],
    totalCost: 0.0267,
    totalTokens: 8840,
    trigger: "cron:9am",
  },
  {
    sessionId: "sess-009",
    agentId: "opera-crm-monitor",
    startedAt: "2026-03-06T09:00:04Z",
    completedAt: "2026-03-06T09:01:08Z",
    status: "success",
    steps: [
      { name: "fetch-deals", durationMs: 14900, tokensUsed: 1100 },
      { name: "analyze-stale", durationMs: 30200, tokensUsed: 2700 },
      { name: "send-summary", durationMs: 3900, tokensUsed: 400 },
    ],
    tools: ["HubSpot", "Slack"],
    totalCost: 0.0128,
    totalTokens: 4200,
    trigger: "cron:9am",
  },
  {
    sessionId: "sess-010",
    agentId: "opera-crm-monitor",
    startedAt: "2026-03-05T12:10:33Z",
    completedAt: "2026-03-05T12:11:44Z",
    status: "success",
    steps: [
      { name: "fetch-deals", durationMs: 16400, tokensUsed: 1250 },
      { name: "analyze-stale", durationMs: 33400, tokensUsed: 3000 },
      { name: "send-summary", durationMs: 5200, tokensUsed: 500 },
      { name: "log-to-sheets", durationMs: 8200, tokensUsed: 320 },
    ],
    tools: ["HubSpot", "Slack", "Google Sheets"],
    totalCost: 0.0154,
    totalTokens: 5070,
    trigger: "webhook:deal-update",
  },
  {
    sessionId: "sess-011",
    agentId: "opera-crm-monitor",
    startedAt: "2026-03-05T09:00:07Z",
    completedAt: "2026-03-05T09:01:31Z",
    status: "success",
    steps: [
      { name: "fetch-deals", durationMs: 18000, tokensUsed: 1280 },
      { name: "analyze-stale", durationMs: 44600, tokensUsed: 4100 },
      { name: "send-summary", durationMs: 5600, tokensUsed: 480 },
    ],
    tools: ["HubSpot", "Slack"],
    totalCost: 0.0178,
    totalTokens: 5860,
    trigger: "cron:9am",
  },
  {
    sessionId: "sess-012",
    agentId: "opera-crm-monitor",
    startedAt: "2026-03-04T09:00:05Z",
    completedAt: "2026-03-04T09:01:19Z",
    status: "success",
    steps: [
      { name: "fetch-deals", durationMs: 15600, tokensUsed: 1150 },
      { name: "analyze-stale", durationMs: 38800, tokensUsed: 3300 },
      { name: "send-summary", durationMs: 4100, tokensUsed: 430 },
    ],
    tools: ["HubSpot", "Slack"],
    totalCost: 0.0149,
    totalTokens: 4880,
    trigger: "cron:9am",
  },
];

// ─── Summary Templates ─────────────────────────────────────

const SUMMARY_TEMPLATES: Record<string, (s: RawSession) => string> = {
  "sess-001": () => "Checked 47 deals in HubSpot, found 3 stale (no activity 14+ days), sent Slack summary to #sales-ops",
  "sess-002": () => "Scanned 47 deals, all healthy. No stale deals found. Sent all-clear to #sales-ops",
  "sess-003": () => "Triggered by deal update webhook. Checked 12 recently modified deals. HubSpot API was slow (42s fetch). Found 1 deal missing next steps, flagged in Slack",
  "sess-004": () => "Morning scan: 47 deals checked, 5 stale deals found. Sent detailed breakdown to #sales-ops with owner tags",
  "sess-005": () => "Found 8 stale deals, 2 critical (>30 days idle). Created follow-up tasks in Google Calendar for deal owners. Updated deal tags in HubSpot",
  "sess-006": () => "Manual run failed. HubSpot API returned 503 after 22s. No deals processed",
  "sess-007": () => "Morning scan: 44 deals checked, 2 stale. Sent summary to #sales-ops",
  "sess-008": () => "Found 6 stale deals including 1 enterprise deal ($240K). Created 4 follow-up calendar events. Sent priority alert to #sales-leadership",
  "sess-009": () => "Morning scan: 43 deals checked, 2 stale. Routine summary sent to #sales-ops",
  "sess-010": () => "Triggered by deal update. Checked 12 deals, logged activity snapshot to Google Sheets for weekly report",
  "sess-011": () => "Morning scan: 46 deals, 4 stale. Sent summary with win-probability analysis to #sales-ops",
  "sess-012": () => "Morning scan: 42 deals, 3 stale. Routine summary sent. Pipeline value: $1.8M across active deals",
};

// ─── Public API ─────────────────────────────────────────────

/**
 * Format a raw session into a plain English summary.
 * NOT "Executed steps: step1, step2..." — actual human-readable descriptions.
 */
export function formatRunSummary(session: RawSession): string {
  const template = SUMMARY_TEMPLATES[session.sessionId];
  if (template) return template(session);

  // Fallback: generate a basic summary from step data
  const stepNames = session.steps.map((s) => s.name).join(", ");
  const toolList = session.tools.join(", ");
  return `Ran ${session.steps.length} steps (${stepNames}) using ${toolList}. Cost: $${session.totalCost.toFixed(4)}`;
}

/**
 * Get paginated activity feed for an agent.
 * Returns plain English summaries, not raw log data.
 */
export async function getActivityFeed(
  agentId: string,
  limit: number = 10,
  cursor?: string
): Promise<{ entries: ActivityEntry[]; nextCursor?: string }> {
  // Filter sessions for this agent (mock: all sessions are for opera-crm-monitor)
  const allSessions = MOCK_SESSIONS.filter(
    (s) => s.agentId === agentId || agentId === "opera-crm-monitor"
  );

  // Apply cursor-based pagination
  let startIndex = 0;
  if (cursor) {
    const cursorIdx = allSessions.findIndex((s) => s.sessionId === cursor);
    if (cursorIdx >= 0) startIndex = cursorIdx + 1;
  }

  const page = allSessions.slice(startIndex, startIndex + limit);
  const nextCursor =
    startIndex + limit < allSessions.length
      ? page[page.length - 1]?.sessionId
      : undefined;

  const entries: ActivityEntry[] = page.map((session) => {
    const totalDuration = session.steps.reduce((sum, s) => sum + s.durationMs, 0);
    return {
      id: session.sessionId,
      timestamp: session.startedAt,
      summary: formatRunSummary(session),
      cost: session.totalCost,
      durationMs: totalDuration,
      status: session.status,
      details: {
        steps: session.steps.map((s) => s.name),
        tools: session.tools,
        tokensUsed: session.totalTokens,
      },
    };
  });

  return { entries, nextCursor };
}

/**
 * Get aggregate activity stats for an agent.
 */
export async function getActivityStats(
  agentId: string
): Promise<{
  totalRuns: number;
  successRate: number;
  avgCost: number;
  avgDuration: number;
}> {
  const allSessions = MOCK_SESSIONS.filter(
    (s) => s.agentId === agentId || agentId === "opera-crm-monitor"
  );

  const totalRuns = allSessions.length;
  const successCount = allSessions.filter((s) => s.status === "success").length;
  const totalCost = allSessions.reduce((sum, s) => sum + s.totalCost, 0);
  const totalDuration = allSessions.reduce(
    (sum, s) => sum + s.steps.reduce((ss, step) => ss + step.durationMs, 0),
    0
  );

  return {
    totalRuns,
    successRate: totalRuns > 0 ? successCount / totalRuns : 0,
    avgCost: totalRuns > 0 ? totalCost / totalRuns : 0,
    avgDuration: totalRuns > 0 ? totalDuration / totalRuns : 0,
  };
}
