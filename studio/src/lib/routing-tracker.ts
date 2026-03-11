/**
 * AgentLens Studio — Routing Tracker
 *
 * Tracks and exposes query routing decisions made by agent-runtime/router.js.
 * Shows which data source was chosen for each query, confidence scores,
 * and whether the confidence gate passed.
 *
 * Currently returns realistic mock data.
 * In production, reads from a routing_decisions log table or agent_sessions details.
 */

import { RoutingDecision } from "./types";

// ─── Mock Routing Decisions ─────────────────────────────────

const MOCK_DECISIONS: Record<string, RoutingDecision[]> = {
  "opera-crm-monitor": [
    {
      queryPreview: "Get all deals with stage 'Negotiation' updated in last 14 days",
      route: "database",
      confidence: 0.96,
      passedGate: true,
      timestamp: "2026-03-11T09:00:14Z",
    },
    {
      queryPreview: "Find contact info for deal owner of Acme Corp deal",
      route: "api",
      confidence: 0.91,
      passedGate: true,
      timestamp: "2026-03-11T09:00:18Z",
    },
    {
      queryPreview: "What is the average enterprise deal close rate this quarter?",
      route: "database",
      confidence: 0.88,
      passedGate: true,
      timestamp: "2026-03-11T09:00:22Z",
    },
    {
      queryPreview: "Check if HubSpot has any API maintenance scheduled",
      route: "web",
      confidence: 0.72,
      passedGate: true,
      timestamp: "2026-03-11T09:00:25Z",
    },
    {
      queryPreview: "What is our company's stale deal policy?",
      route: "documents",
      confidence: 0.94,
      passedGate: true,
      timestamp: "2026-03-10T09:00:12Z",
    },
    {
      queryPreview: "Get Slack channel ID for sales-ops",
      route: "api",
      confidence: 0.89,
      passedGate: true,
      timestamp: "2026-03-10T09:00:30Z",
    },
    {
      queryPreview: "How should I format the stale deal summary?",
      route: "documents",
      confidence: 0.85,
      passedGate: true,
      timestamp: "2026-03-10T09:01:05Z",
    },
    {
      queryPreview: "Find recent industry benchmarks for SaaS deal velocity",
      route: "web",
      confidence: 0.42,
      passedGate: false,
      timestamp: "2026-03-09T09:00:45Z",
      fallbackUsed: true,
    },
    {
      queryPreview: "Pull deal history for deal ID 12847392",
      route: "database",
      confidence: 0.97,
      passedGate: true,
      timestamp: "2026-03-09T09:01:02Z",
    },
    {
      queryPreview: "What calendar should follow-up events go on?",
      route: "documents",
      confidence: 0.78,
      passedGate: true,
      timestamp: "2026-03-08T09:00:28Z",
    },
    {
      queryPreview: "Post summary message to Slack channel",
      route: "api",
      confidence: 0.98,
      passedGate: true,
      timestamp: "2026-03-08T09:01:10Z",
    },
    {
      queryPreview: "Is deal owner 'Mike Torres' currently on PTO?",
      route: "api",
      confidence: 0.38,
      passedGate: false,
      timestamp: "2026-03-07T09:00:40Z",
      fallbackUsed: true,
    },
    {
      queryPreview: "Get list of all deal custom properties in HubSpot",
      route: "api",
      confidence: 0.93,
      passedGate: true,
      timestamp: "2026-03-07T09:00:15Z",
    },
    {
      queryPreview: "Calculate pipeline value by deal stage",
      route: "database",
      confidence: 0.91,
      passedGate: true,
      timestamp: "2026-03-06T09:00:32Z",
    },
    {
      queryPreview: "What does 'deal health score' mean in our context?",
      route: "documents",
      confidence: 0.82,
      passedGate: true,
      timestamp: "2026-03-06T09:00:48Z",
    },
  ],
};

// ─── Public API ─────────────────────────────────────────────

/**
 * Get recent routing decisions for an agent.
 * Shows what queries were routed where, with confidence scores.
 */
export async function getRoutingDecisions(
  agentId: string,
  limit: number = 20
): Promise<RoutingDecision[]> {
  const decisions = MOCK_DECISIONS[agentId] || MOCK_DECISIONS["opera-crm-monitor"] || [];
  return decisions
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

/**
 * Get aggregate routing statistics.
 */
export async function getRoutingStats(
  agentId: string
): Promise<{
  byRoute: Record<string, number>;
  avgConfidence: number;
  gatePassRate: number;
}> {
  const decisions = MOCK_DECISIONS[agentId] || MOCK_DECISIONS["opera-crm-monitor"] || [];

  const byRoute: Record<string, number> = {};
  let totalConfidence = 0;
  let passCount = 0;

  for (const d of decisions) {
    byRoute[d.route] = (byRoute[d.route] || 0) + 1;
    totalConfidence += d.confidence;
    if (d.passedGate) passCount++;
  }

  return {
    byRoute,
    avgConfidence: decisions.length > 0 ? totalConfidence / decisions.length : 0,
    gatePassRate: decisions.length > 0 ? passCount / decisions.length : 0,
  };
}
